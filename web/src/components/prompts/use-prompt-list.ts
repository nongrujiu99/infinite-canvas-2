import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { getImagePreviewRevision, subscribeImagePreviews } from "@/services/image-storage";
import { ALL_PROMPTS_OPTION, LOCAL_PROMPT_SOURCE_ID, fetchPrompts } from "@/services/api/prompts";
import { promptCoverUrl, usePromptLibraryStore } from "@/stores/use-prompt-library-store";

export const PROMPT_PAGE_SIZE = 20;

export function usePromptList({ keyword, tags, category, enabled = true }: { keyword: string; tags: string[]; category: string; enabled?: boolean }) {
    const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
        return () => clearTimeout(timer);
    }, [keyword]);
    // 本地库是异步 hydration 的，且随时可能新增、改名、换分类；把它算进 queryKey，
    // 否则首次读到空库就会一直缓存空结果，改完模板列表也不会刷新
    const library = usePromptLibraryStore((state) => state.prompts);
    const libraryKey = `${library.length}:${library.map((item) => item.updatedAt).join("|")}`;
    // 缩略图比列表晚到（索引里的封面是查询那一刻的快照），订阅 revision 在这里就地补上，
    // 而不是把 revision 塞进 queryKey——那样每生成一张缩略图就会重跑一次列表查询
    const previewRevision = useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const query = useInfiniteQuery({
        queryKey: ["prompts", debouncedKeyword, tags, category, libraryKey],
        queryFn: ({ pageParam }) => fetchPrompts({ keyword: debouncedKeyword, tag: tags, category, page: pageParam, pageSize: PROMPT_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
        enabled,
    });
    const firstPage = query.data?.pages[0];
    const items = useMemo(() => {
        void previewRevision;
        const raw = query.data?.pages.flatMap((page) => page.items) || [];
        if (!raw.length) return raw;
        const localById = new Map(library.map((item) => [item.id, item]));
        return raw.map((item) => {
            if (item.sourceId !== LOCAL_PROMPT_SOURCE_ID) return item;
            const source = localById.get(item.id);
            const cover = source ? promptCoverUrl(source) : "";
            return cover && cover !== item.coverUrl ? { ...item, coverUrl: cover } : item;
        });
    }, [library, previewRevision, query.data?.pages]);
    return {
        query,
        items,
        tags: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.tags || [])], [firstPage?.tags]),
        categories: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.categories || [])], [firstPage?.categories]),
        total: firstPage?.total || 0,
    };
}
