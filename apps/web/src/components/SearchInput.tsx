import { useEffect, useRef } from "react";

/**
 * 絞り込みの入力欄。値は URL（?q=）に入れるが、入力欄の表示は URL から描き直さない（非制御）。
 * URL の更新は React Router が遷移として後回しにするので、制御された入力欄にすると打った直後に古い値へ戻され、
 * 日本語・中国語の変換中の文字が壊れる（「渡辺」が「ｗわわｔ…」になる）。
 * 戻る・進むや、引き継ぎ後に URL の値を読んだときなど、外から値が変わったときだけ、入力中でなければ表示を合わせる。
 */
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el !== document.activeElement && el.value !== value) el.value = value;
  }, [value]);
  return <input ref={ref} type="search" placeholder={placeholder} defaultValue={value} onChange={(e) => onChange(e.target.value)} />;
}
