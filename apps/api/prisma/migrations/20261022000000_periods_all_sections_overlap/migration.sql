-- A period for every section (section_id null) must not overlap a period of one section either (same year
-- and kind). The EXCLUDE constraint periods_no_overlap reads a null section as one value of its own, so it
-- only compares equal sections; the service checks the rest, and this trigger makes the database say it too.

-- Pre-flight: stop with the list if the data already breaks the rule, so it can be corrected first.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT format('%s / %s', a.label, b.label), ', ')
    INTO bad
    FROM periods a
    JOIN periods b ON a.school_year_id = b.school_year_id AND a.kind = b.kind AND a.id < b.id
                  AND (a.section_id IS NULL OR b.section_id IS NULL)
                  AND daterange(a.starts_on, a.ends_on, '[]') && daterange(b.starts_on, b.ends_on, '[]');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Périodes qui se chevauchent (toutes sections et une section) : %. Corrigez leurs dates avant de migrer.', bad;
  END IF;
END $$;

CREATE FUNCTION periods_check_all_sections_overlap() RETURNS trigger AS $$
BEGIN
  -- Same advisory lock as PeriodsService.write: concurrent writes of one year queue up here, and the
  -- query below (a volatile function takes a fresh snapshot per statement) then sees the earlier commit.
  PERFORM pg_advisory_xact_lock(hashtextextended('periods:' || NEW.school_year_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM periods p
    WHERE p.school_year_id = NEW.school_year_id
      AND p.kind = NEW.kind
      AND p.id <> NEW.id
      AND (p.section_id IS NULL OR NEW.section_id IS NULL OR p.section_id = NEW.section_id)
      AND daterange(p.starts_on, p.ends_on, '[]') && daterange(NEW.starts_on, NEW.ends_on, '[]')
  ) THEN
    RAISE EXCEPTION 'periods_no_overlap_all_sections: overlapping period of the same kind'
      USING ERRCODE = '23P01', CONSTRAINT = 'periods_no_overlap_all_sections';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER periods_no_overlap_all_sections
  BEFORE INSERT OR UPDATE OF school_year_id, kind, section_id, starts_on, ends_on ON periods
  FOR EACH ROW EXECUTE FUNCTION periods_check_all_sections_overlap();
