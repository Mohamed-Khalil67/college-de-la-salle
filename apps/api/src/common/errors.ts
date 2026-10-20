import { ForbiddenException, NotFoundException } from '@nestjs/common';

export const forbidden = () => new ForbiddenException('Action non autorisée.');
export const notFound = (what = 'Élément') => new NotFoundException(`${what} introuvable.`);
