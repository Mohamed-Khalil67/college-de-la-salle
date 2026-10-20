import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTACTS, MILESTONES, SCHOOL, SECTIONS } from '../../school';
import { Icon } from '../../ui';
import { ContactForm } from '../shared/contact-form';
import { telHref } from '../shared/contact-mail';
import { Timeline } from '../shared/timeline';
import { type Feature, FeatureCard } from './feature-card';
import { Hero } from './hero';
import { TrackCard } from './track-card';

const TEASER_YEARS = ['1898', '1905', '1955', '2013'];
const HOME_PHONES = ['Standard', 'Bac français', 'Cycle secondaire'];

const FEATURES: readonly Feature[] = [
  {
    photo: 'chapelle-coupole',
    meta: 'Histoire, 1958',
    title: 'La chapelle De La Salle, inaugurée en décembre 1958',
    text: 'Près de quatre ans de travaux, de 1954 à 1958, pour la chapelle du collège et sa coupole.',
    link: '/histoire',
    fragment: 'annee-1958',
  },
  {
    photo: 'entree-1',
    meta: 'Bac français',
    title: 'Les inscriptions au Bac français se font en ligne',
    text: 'Un formulaire pour la préparation au Bac et un autre pour le Bac, sur le site de la section.',
    link: '/bac-francais',
    fragment: 'inscription',
  },
  {
    photo: 'freres-1926',
    meta: 'Archives, avril 1926',
    title: 'Les Frères d’Égypte réunis à Daher',
    text: 'Près de 190 Frères venus de toutes les écoles du pays se retrouvent au collège pour leur retraite annuelle.',
    link: '/histoire',
    fragment: 'annee-1926',
  },
];

/** `/`: Accueil. */
@Component({
  selector: 'site-home-page',
  imports: [RouterLink, Icon, Hero, Timeline, TrackCard, FeatureCard, ContactForm],
  template: `
    <section siteHero></section>

    <section class="section section--subtle" aria-labelledby="histoire-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="histoire-title" class="t-h1">Plus d’un siècle à Daher</h2>
            <p class="t-body-l">
              Fondé par les Frères des Écoles chrétiennes, l’institut créé par saint Jean-Baptiste de La Salle, le collège
              appartient au réseau lasallien d’Égypte et à ses 900 établissements dans le monde.
            </p>
          </div>
          <a class="t-label" routerLink="/histoire">Lire l’histoire du collège</a>
        </div>
        <ol siteTimeline [milestones]="milestones"></ol>
      </div>
    </section>

    <section class="section" aria-labelledby="filieres-title">
      <div class="container">
        <div class="section__head">
          <div class="section__intro">
            <h2 id="filieres-title" class="t-h1">Deux baccalauréats, un même projet éducatif</h2>
            <p class="t-body-l t-muted">Les deux filières partagent les mêmes valeurs lasalliennes, la même cour et la même exigence.</p>
          </div>
        </div>
        <div class="grid-2">
          @for (s of sections; track s.slug) {
            <article siteTrackCard [track]="s"></article>
          }
        </div>
      </div>
    </section>

    <section class="section section--subtle" aria-labelledby="decouvrir-title">
      <div class="container">
        <div class="section__head">
          <h2 id="decouvrir-title" class="t-h1">À découvrir</h2>
        </div>
        <div class="grid-3">
          @for (f of features; track f.title) {
            <article siteFeatureCard [feature]="f"></article>
          }
        </div>
      </div>
    </section>

    <section class="section section--inverse on-inverse" aria-labelledby="contact-title">
      <div class="container grid-2 split">
        <div class="stack">
          <h2 id="contact-title" class="t-h1">Inscriptions et contact</h2>
          <p class="t-body-l">
            Les ouvertures d’inscription et la liste des pièces à fournir sont publiées par le collège. Écrivez au secrétariat
            ou appelez directement le cycle concerné.
          </p>
          <ul class="contact-lines" role="list">
            <li><cdls-icon name="map-pin" /><span>{{ school.address }}</span></li>
            <li><cdls-icon name="mail" /><a [href]="'mailto:' + school.email">{{ school.email }}</a></li>
          </ul>
          <dl class="phones">
            @for (c of phones; track c.label) {
              <dt>{{ c.label }}</dt>
              <dd><a [href]="tel(c.phones[0])">{{ c.phones[0] }}</a></dd>
            }
          </dl>
          <p><a routerLink="/contact">Tous les numéros par service</a></p>
        </div>
        <form siteContactForm [headingLevel]="3"></form>
      </div>
    </section>
  `,
})
export class HomePage {
  protected readonly school = SCHOOL;
  protected readonly sections = SECTIONS;
  protected readonly features = FEATURES;
  protected readonly milestones = MILESTONES.filter((m) => TEASER_YEARS.includes(m.year));
  protected readonly phones = CONTACTS.filter((c) => HOME_PHONES.includes(c.label));
  protected readonly tel = telHref;
}
