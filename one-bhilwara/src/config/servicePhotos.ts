/**
 * Category photos for the Services section (Unsplash, free to use under the Unsplash License).
 * They illustrate a *type* of service only — never a specific provider listed in the app.
 * Served through the same-origin `/img/*` proxy (vercel.json / netlify.toml) so the service
 * worker can cache them for offline use. A broken or missing photo falls back to a gradient tile.
 */
export interface ServicePhoto { id: string; alt: string }

export const SERVICE_PHOTOS: Record<string, ServicePhoto> = {
  plumber: { id: '1607472586893-edb57bdc0e39', alt: 'Plumber working on pipes under a sink' },
  electrician: { id: '1621905251189-08b45d6a269e', alt: 'Electrician working on a wiring panel' },
  ac: { id: '1621905252507-b35492cc74b4', alt: 'Technician servicing equipment' },
  cleaning: { id: '1581578731548-c64695cc6952', alt: 'Professional cleaner at work in a home' },
  carpenter: { id: '1504148455328-c376907d081c', alt: 'Carpentry tools on a workbench' },
  mechanic: { id: '1486262715619-67b85e0b08d3', alt: 'Mechanic working on a car engine' },
  salon: { id: '1503951914875-452162b0f3f1', alt: 'Barber chair in a salon' },
  beautician: { id: '1487412947147-5cebf100ffc2', alt: 'Makeup brushes and cosmetics' },
  painter: { id: '1562259949-e8e7689d7828', alt: 'Painter rolling paint on a wall' },
  gardener: { id: '1416879595882-3373a0480b5b', alt: 'Hands planting seedlings in soil' },
  tutor: { id: '1503676260728-1c00da094a0b', alt: 'Student studying with books' },
  labour: { id: '1503387762-592deb58ef4e', alt: 'Construction site with workers' },
  contractor: { id: '1541888946425-d81bb19240f5', alt: 'Building under construction' },
  'device-repair': { id: '1597872200969-2b65d56bd16b', alt: 'Technician repairing a smartphone' }
};

export const HERO_PHOTO: ServicePhoto = { id: '1581578731548-c64695cc6952', alt: 'A home-service professional at work' };

export const photoUrl = (id: string, w = 640, h?: number) =>
  `/img/photo-${id}?w=${w}${h ? `&h=${h}` : ''}&q=70&auto=format&fit=crop`;

export const PHOTO_CREDIT = { label: 'Photos: Unsplash', url: 'https://unsplash.com/license' };
