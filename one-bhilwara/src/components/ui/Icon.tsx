import {
  AirVent, Bike, Briefcase, BriefcaseBusiness, Bug, Building2, Bus, Car, Flower2, GraduationCap, Hammer, HandHelping, HardHat, Heart, HeartPulse,
  House, Landmark, Newspaper, PaintRoller, PartyPopper, Scale, Scissors, ShoppingBag, Smartphone, Sparkles, SprayCan, Store, Truck,
  UtensilsCrossed, WashingMachine, Wheat, Wrench, Zap, type LucideIcon
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  AirVent, Bike, Briefcase, BriefcaseBusiness, Bug, Building2, Bus, Car, Flower2, GraduationCap, Hammer, HandHelping, HardHat, Heart, HeartPulse,
  House, Landmark, Newspaper, PaintRoller, PartyPopper, Scale, Scissors, ShoppingBag, Smartphone, Sparkles, SprayCan, Store, Truck,
  UtensilsCrossed, WashingMachine, Wheat, Wrench, Zap
};

/** Renders a lucide icon from a config string (used by catalog-driven tiles). */
export function Icon({ name, className = 'size-5', ...rest }: { name: string; className?: string; 'aria-hidden'?: boolean }) {
  const C = MAP[name] ?? Store;
  return <C className={className} aria-hidden={rest['aria-hidden'] ?? true} />;
}
