import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";

// Compact language switcher — shows the current language code with a globe
// icon and reveals a small menu with all supported languages.
const LanguageSwitcher = ({ className = "", variant = "icon" }) => {
  const { lang, setLang, languages } = useI18n();
  const current = languages.find((l) => l.code === lang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-[#E5E2DC] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#2D2A26] hover:bg-white active:scale-95 transition ${className}`}
          aria-label="Change language"
          data-testid="language-switcher"
        >
          <Globe className="w-3.5 h-3.5" strokeWidth={1.8} />
          {variant === "icon" ? current.code.toUpperCase() : current.native}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="rounded-2xl min-w-[160px] p-1.5"
        data-testid="language-menu"
      >
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLang(l.code)}
            className="rounded-xl cursor-pointer text-sm flex items-center justify-between gap-2 px-3 py-2"
            data-testid={`language-option-${l.code}`}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>{l.flag}</span>
              <span className="font-medium">{l.native}</span>
            </span>
            {l.code === lang && (
              <Check className="w-3.5 h-3.5 text-[#16A34A]" strokeWidth={2.5} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
