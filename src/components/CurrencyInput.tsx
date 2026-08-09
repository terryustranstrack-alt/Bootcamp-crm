"use client";

import type { ChangeEvent } from "react";

function formatRibuan(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

type CurrencyInputProps = {
  id?: string;
  value: string;
  onChange: (raw: string) => void;
  className?: string;
  placeholder?: string;
};

export default function CurrencyInput({
  id,
  value,
  onChange,
  className,
  placeholder,
}: CurrencyInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value.replace(/\D/g, ""));
  }

  return (
    <input
      id={id}
      inputMode="numeric"
      type="text"
      value={formatRibuan(value)}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
