/** データを読み込んでいる間に出す、ページのおおまかな形（数字のカードと一覧の行） */
export function PageSkeleton() {
  return (
    <div className="skeleton" role="status" aria-label="読み込み中">
      <div className="sk-stats">
        <div className="sk" />
        <div className="sk" />
        <div className="sk" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={i % 3 === 2 ? "sk sk-line short" : "sk sk-line"} />
      ))}
    </div>
  );
}
