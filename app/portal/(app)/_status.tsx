import { Badge, type BadgeTone } from "@/components/ui/badge";

export function PlainStatus({ s }: { s: { text: string; tone: string } }) {
  return <Badge tone={s.tone as BadgeTone}>{s.text}</Badge>;
}
