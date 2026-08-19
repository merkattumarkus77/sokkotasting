"use client";

interface NameListInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  minItems: number;
}

export default function NameListInput({
  label,
  values,
  onChange,
  placeholder,
  minItems,
}: NameListInputProps) {
  function updateAt(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...values, ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => updateAt(index, e.target.value)}
            placeholder={`${placeholder} ${index + 1}`}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => removeAt(index)}
            disabled={values.length <= minItems}
            className="rounded-lg border border-border px-3 text-muted disabled:opacity-30"
            aria-label="Poista"
          >
            &minus;
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start rounded-lg border border-border px-3 py-1 text-sm text-muted hover:text-foreground"
      >
        + Lisää
      </button>
    </div>
  );
}
