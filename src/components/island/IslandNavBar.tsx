import type { LucideIcon } from "lucide-react";
import { Power } from "lucide-react";

export type IslandTab = "home" | "settings" | "plans" | "profile";

interface TabDef {
  id: IslandTab;
  label: string;
  icon: LucideIcon;
}

interface Props {
  tabs: TabDef[];
  active: IslandTab;
  onSelect: (id: IslandTab) => void;
  onQuit: () => void;
}

export function IslandNavBar({ tabs, active, onSelect, onQuit }: Props) {
  return (
    <header className="island-bar shrink-0">
      <nav className="island-tabs" aria-label="Island">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-active={active === id}
            className="island-tab"
            onClick={() => onSelect(id)}
          >
            <Icon size={15} strokeWidth={2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button
        type="button"
        className="island-ghost-btn island-ghost-danger"
        onClick={onQuit}
        aria-label="Quit"
      >
        <Power size={15} strokeWidth={2} />
      </button>
    </header>
  );
}
