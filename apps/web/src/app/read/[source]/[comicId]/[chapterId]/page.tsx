'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getChapterImages } from '@/lib/api';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useHistory } from '@/hooks/useHistory';
import { useFavorites } from '@/hooks/useFavorites';
import type { ChapterDetail } from '@/types';

export default function ReaderPage() {
  const params = useParams<{ source: string; comicId: string; chapterId: string }>();
  const router = useRouter();
  const { save } = useReadingProgress(params.source, params.comicId);
  const { add } = useHistory();
  const { toggle, checkFavorite } = useFavorites();

  const [detail, setDetail] = useState<ChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const pageRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [d, fav] = await Promise.all([
          getChapterImages(params.source, params.comicId, params.chapterId),
          checkFavorite(params.source, params.comicId),
        ]);
        setDetail(d);
        setIsFav(fav);
      } catch (e: any) {
        setError(e.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.source, params.comicId, params.chapterId, checkFavorite]);

  // 暗色模式: 将 dark class 添加到 <html> 元素
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    return () => document.documentElement.classList.remove('dark');
  }, [darkMode]);

  // 记录阅读进度和浏览历史
  useEffect(() => {
    if (!detail) return;
    const comicTitle = detail.comicTitle || '';
    save({
      comicId: params.comicId,
      comicTitle,
      source: params.source,
      chapterId: detail.chapterId,
      chapterTitle: detail.chapterTitle,
      chapterUrl: `/read/${params.source}/${params.comicId}/${detail.chapterId}`,
      pageIndex: 0,
    });
    add({
      comicId: params.comicId,
      title: comicTitle,
      source: params.source,
      comicUrl: `/comic/${params.source}/${params.comicId}`,
      chapterTitle: detail.chapterTitle,
      chapterUrl: `/read/${params.source}/${params.comicId}/${detail.chapterId}`,
      pageIndex: 0,
    });
  }, [detail, params, save, add]);

  // 监听 window 滚动事件追踪页码（带 500ms 节流）
  const handleScroll = useCallback(() => {
    if (saveTimerRef.current) return; // 节流：上一次还没执行完
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      if (!detail?.images.length) return;
      const imgs = document.querySelectorAll('.reader-image-wrapper');
      let currentPage = 0;
      imgs.forEach((img, i) => {
        const rect = img.getBoundingClientRect();
        if (rect.top <= window.innerHeight / 2) currentPage = i;
      });
      pageRef.current = currentPage;
      save({
        comicId: params.comicId,
        comicTitle: detail.comicTitle || '',
        source: params.source,
        chapterId: detail.chapterId,
        chapterTitle: detail.chapterTitle,
        chapterUrl: `/read/${params.source}/${params.comicId}/${detail.chapterId}`,
        pageIndex: currentPage,
      });
    }, 500);
  }, [detail, params, save]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [handleScroll]);

  const handleFavorite = async () => {
    const result = await toggle({
      comicId: params.comicId,
      title: detail?.comicTitle || '',
      cover: '',
      source: params.source,
      lastChapter: detail?.chapterTitle || '',
    });
    setIsFav(result);
  };

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;
  if (error) return <div className="text-center py-16 text-red-500">❌ {error}</div>;
  if (!detail) return null;

  return (
    <>
      {/* 顶部导航 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 dark:bg-gray-950/90 dark:border-gray-800">
        <div className="flex items-center justify-between px-4 h-12">
          <button onClick={() => router.back()} className="btn-ghost text-sm">
            ← 返回
          </button>
          <div className="text-center min-w-0 flex-1 px-2">
            <p className="text-sm font-medium line-clamp-1">{detail.comicTitle || detail.chapterTitle}</p>
            <p className="text-xs text-gray-500">{detail.chapterTitle}</p>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} className="btn-ghost">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* 图片阅读区 */}
      <div className="mt-12 mb-16 bg-gray-100 dark:bg-black min-h-screen">
        <div className="max-w-reader mx-auto">
          {detail.images.length === 0 ? (
            <div className="text-center py-24 text-gray-500">暂无图片</div>
          ) : (
            detail.images.map((url, i) => (
              <div key={i} className="reader-image-wrapper">
                <img
                  src={url}
                  alt={`第${i + 1}页`}
                  className="w-full"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* 底部工具栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur border-t border-gray-100 dark:bg-gray-950/90 dark:border-gray-800">
        <div className="flex justify-around items-center h-14 max-w-2xl mx-auto">
          <button
            onClick={() => detail.prevChapter && router.push(`/read/${params.source}/${params.comicId}/${detail.prevChapter.chapterId}`)}
            disabled={!detail.prevChapter}
            className="btn-ghost text-sm disabled:opacity-30"
          >
            ⬅ 上一章
          </button>
          <button onClick={() => router.push(`/comic/${params.source}/${params.comicId}`)} className="btn-ghost text-sm">
            📋 目录
          </button>
          <button
            onClick={() => detail.nextChapter && router.push(`/read/${params.source}/${params.comicId}/${detail.nextChapter.chapterId}`)}
            disabled={!detail.nextChapter}
            className="btn-ghost text-sm disabled:opacity-30"
          >
            下一章 ➡
          </button>
          <button onClick={handleFavorite} className="btn-ghost">
            {isFav ? '❤️' : '🤍'}
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className="btn-ghost">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </>
  );
}
