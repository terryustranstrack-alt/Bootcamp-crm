"use client";

import type { ChangeEvent } from "react";

// Kasih titik pemisah ribuan untuk tampilan, gaya angka Indonesia
// (mis. "1000000" -> "1.000.000"). Nilai yang disimpan di state (`raw`)
// tetap digit polos tanpa titik.
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

// Input angka rupiah: user melihat angka dengan titik ribuan
// (mis. "1.000.000"), tapi `value`/`onChange` yang dipakai pemanggil
// selalu digit polos saja supaya gampang di-convert ke Number.
export default function CurrencyInput({
  id,
  value,
  onChange,
  className,
  placeholder,
}: CurrencyInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    // Buang semua karakter non-digit (termasuk titik yang baru diketik/lihat)
    // sebelum dikirim ke pemanggil, supaya value yang disimpan selalu bersih.
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
