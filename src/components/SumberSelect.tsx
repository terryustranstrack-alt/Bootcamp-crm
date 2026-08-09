"use client";

import { useState } from "react";

const LAINNYA = "__lainnya__";

export default function SumberSelect({
  value,
  onChange,
  options,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  id?: string;
}) {
  const isCustomValue = value !== "" && !options.includes(value);
  const [showCustomInput, setShowCustomInput] = useState(isCustomValue);

  function handleSelectChange(selected: string) {
    if (selected === LAINNYA) {
      setShowCustomInput(true);
      onChange("");
    } else {
      setShowCustomInput(false);
      onChange(selected);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        id={id}
        value={showCustomInput ? LAINNYA : value}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="border rounded px-3 py-2"
      >
        <option value="">- Pilih sumber -</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={LAINNYA}>Lainnya (tulis sendiri)...</option>
      </select>
      {showCustomInput && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tulis sumber baru"
          className="border rounded px-3 py-2"
          autoFocus
        />
      )}
    </div>
  );
}
