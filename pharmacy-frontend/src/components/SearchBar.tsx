interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

function SearchBar({
  value,
  onChange,
  placeholder = "Rechercher...",
  className = "",
  ariaLabel = "Rechercher",
}: SearchBarProps) {
  return (
    <div className={className}>
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export default SearchBar;
