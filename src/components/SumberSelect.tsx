"use client";

import { useState } from "react";

// Value dummy khusus untuk opsi "Lainnya (tulis sendiri)..." di dropdown.
// Sengaja dibuat aneh/unik supaya tidak mungkin bentrok dengan nilai sumber
// asli yang diketik user sendiri.
const LAINNYA = "__lainnya__";

// Dropdown pilih "Sumber" lead, dengan opsi tambahan untuk mengetik sumber
// baru yang belum ada di daftar (mis. sumber lead yang jarang dipakai).
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
  // Kalau value awal (dari data lead yang sudah ada) bukan salah satu
  // opsi standar, langsung tampilkan input custom sejak awal — supaya
  // sumber "aneh" hasil input manual sebelumnya tidak hilang dari tampilan.
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
        <option value="">- Select source -</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={LAINNYA}>Other (type your own)...</option>
      </select>
      {showCustomInput && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a new source"
          className="border rounded px-3 py-2"
          autoFocus
        />
      )}
    </div>
  );
}
