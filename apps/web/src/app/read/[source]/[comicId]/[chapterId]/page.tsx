'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getChapterImages, getComicDetail, getChapters } from '@/lib/api';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useHistory } from '@/hooks/useHistory';
import { useFavorites } from '@/hooks/useFavorites';
import type { ChapterDetail, ComicInfo, ChapterInfo } from '@/types';

const IMAGES_PER_BATCH = 6;
const MAX_IMAGE_RETRIES = 1;

export default function ReaderPage() {
  const params = useParams<{ source: string; comicId: string; chapterId: string }>();
  const router = useRouter();
  const { save } = useReadingProgress(params.source, params.comicId);
  const { add } = useHistory();
  const { toggle, checkFavorite } = useFavorites();

  const [detail, setDetail] = useState<ChapterDetail | null>(null);
  const [comic, setComic] = useState<ComicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [visibleCount, setVisibleCount] = useState(IMAGES_PER_BATCH);
  const pageRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const imageRetries = useRef<Map<number, number>>(new Map());
  const abortRef = useRef(false);

  // 加载章节数据 — 不预加载图片
  useEffect(() => {
    abortRef.current = false;
    const load = async () => {
      setLoading(true);
      setVisibleCount(IMAGES_PER_BATCH);
      imageRetries.current.clear();
      try {
        const [d, c, fav] = await Promise.all([
          getChapterImages(params.source, params.comicId, params.chapterId),
          getComicDetail(params.source, params.comicId),
          checkFavorite(params.source, params.comicId),
        ]);
        if (abortRef.current) return;
        setDetail(d);
        setComic(c);
        setIsFav(fav);
      } catch (e: any) {
        if (!abortRef.current) setError(e.message || '加载失败');
      } finally {
        if (!abortRef.current) setLoading(false);
      }
    };
    load();
    return () => { abortRef.current = true; };
  }, [params.source, params.comicId, params.chapterId, checkFavorite]);

  // 暗色模式
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    return () => document.documentElement.classList.remove('dark');
  }, [darkMode]);

  // 记录阅读进度和浏览历史
  useEffect(() => {
    if (!detail || !comic) return;
    const comicTitle = detail.comicTitle || comic.title || '';
    save({
      comicId: params.comicId,
      comicTitle,
      cover: comic.cover || '',
      source: params.source,
      chapterId: detail.chapterId,
      chapterTitle: detail.chapterTitle,
      chapterUrl: `/read/${params.source}/${params.comicId}/${detail.chapterId}`,
      pageIndex: 0,
    });
    add({
      comicId: params.comicId,
      title: comicTitle,
      cover: comic.cover || '',
      source: params.source,
      comicUrl: `/comic/${params.source}/${params.comicId}`,
      chapterTitle: detail.chapterTitle,
      chapterUrl: `/read/${params.source}/${params.comicId}/${detail.chapterId}`,
      pageIndex: 0,
    });
  }, [detail, comic, params, save, add]);

  // 下一章元数据预加载（仅章节信息，不预加载图片）
  useEffect(() => {
    if (!detail?.nextChapter) return;
    // 静默预加载下一章的章节元数据用于快速导航
    getChapters(params.source, params.comicId).catch(() => {});
  }, [detail?.nextChapter, params.source, params.comicId]);

  // IntersectionObserver: 滚动到底部加载更多
  useEffect(() => {
    if (!detail || visibleCount >= detail.images.length) return;

    // 断开旧观察器
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + IMAGES_PER_BATCH, detail.images.length));
        }
      },
      { rootMargin: '400px' }, // 提前 400px 触发
    );

    // 观察最后一张可见图片
    const sentinel = document.getElementById(`reader-image-${visibleCount - 1}`);
    if (sentinel) observerRef.current.observe(sentinel);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [visibleCount, detail]);

  // 监听滚动追踪页码
  const handleScroll = useCallback(() => {
    if (saveTimerRef.current) return;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
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
        comicTitle: detail.comicTitle || comic?.title || '',
        cover: comic?.cover || '',
        source: params.source,
        chapterId: detail.chapterId,
        chapterTitle: detail.chapterTitle,
        chapterUrl: `/read/${params.source}/${params.comicId}/${detail.chapterId}`,
        pageIndex: currentPage,
      });
    }, 500);
  }, [detail, comic, params, save]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [handleScroll]);

  // 图片加载失败处理 — 限制重试次数
  const handleImageError = useCallback((index: number, url: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const retries = imageRetries.current.get(index) || 0;
    if (retries < MAX_IMAGE_RETRIES) {
      imageRetries.current.set(index, retries + 1);
      // 重试：重新设置 src（带随机参数避免缓存）
      const img = e.target as HTMLImageElement;
      img.src = url + (url.includes('?') ? '&' : '?') + '_retry=' + (retries + 1);
    } else {
      // 超过重试次数，隐藏
      (e.target as HTMLImageElement).style.display = 'none';
    }
  }, []);

  const handleFavorite = async () => {
    const result = await toggle({
      comicId: params.comicId,
      title: detail?.comicTitle || comic?.title || '',
      author: comic?.author || '',
      cover: comic?.cover || '',
      source: params.source,
      lastChapter: detail?.chapterTitle || '',
    });
    setIsFav(result);
  };

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;
  if (error) return <div className="text-center py-16 text-red-500">❌ {error}</div>;
  if (!detail) return null;

  const displayImages = detail.images.slice(0, visibleCount);
  const hasMore = visibleCount < detail.images.length;

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
            <p className="text-xs text-gray-500">
              {detail.chapterTitle}
              {hasMore && <span className="text-gray-400"> · {visibleCount}/{detail.images.length}</span>}
            </p>
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
            <>
              {displayImages.map((url, i) => (
                <div key={i} id={`reader-image-${i}`} className="reader-image-wrapper">
                  <img
                    src={url}
                    alt={`第${i + 1}页`}
                    className="w-full"
                    loading="lazy"
                    onError={(e) => handleImageError(i, url, e)}
                  />
                </div>
              ))}
              {/* 加载更多指示器 */}
              {hasMore && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  加载更多... ({visibleCount}/{detail.images.length})
                </div>
              )}
            </>
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
