'use client';
import { useState, useCallback } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  initialValue?: string;
  placeholder?: string;
}

export function SearchBar({ onSearch, loading, initialValue = '', placeholder = '搜索漫画名称...' }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim()) onSearch(value.trim());
    },
    [value, onSearch]
  );

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="input pr-20 text-lg"
        autoFocus
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary text-sm py-1.5 px-4"
      >
        {loading ? '搜索中...' : '搜索'}
      </button>
    </form>
  );
}
