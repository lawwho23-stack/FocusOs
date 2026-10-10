import { BookOpen, Compass, Globe, Heart, Leaf, Mountain, Rocket, Users } from "lucide-react";
import type { MissionIcon as IconKey } from "@/lib/life-missions";

const icons = { compass: Compass, heart: Heart, globe: Globe, rocket: Rocket, book: BookOpen, leaf: Leaf, users: Users, mountain: Mountain };
export const ICON_LABELS: Record<IconKey, string> = {
  compass: "Compass", heart: "Heart", globe: "Globe", rocket: "Rocket", book: "Book", leaf: "Leaf", users: "People", mountain: "Mountain",
};

export default function MissionIcon({ name, className }: { name: IconKey; className?: string }) {
  const Icon = icons[name] ?? Compass;
  return <Icon aria-hidden="true" className={className} />;
}
