import { nanoid } from "nanoid";

import { EcommercePlanError } from "@/lib/ecommerce/plan-schema";
import { StructuredOutputError } from "@/services/api/image";
import type { EcommerceAnalysisFailureCategory, EcommerceSchemaIssue } from "@/types/ecommerce";

const ANALYSIS_TIMEOUT_MS = 8 * 60 * 1000;
const ANALYSIS_TIMEOUT_MESSAGE = "分析请求已超过 8 分钟，已自动停止，请检查渠道后重试";

type AnalysisRuntime = { runId: string; controller: AbortController; timeoutId: ReturnType<typeof setTimeout> };
const analysisRuntimes = new Map<string, AnalysisRuntime>();

export function beginEcommerceAnalysis(projectId: string) {
    if (analysisRuntimes.has(projectId)) throw new Error("这个项目已有分析请求正在运行，请等待完成或先修改输入以取消旧分析");
    const controller = new AbortController();
    const runtime: AnalysisRuntime = {
        runId: nanoid(),
        controller,
        timeoutId: setTimeout(() => controller.abort(new DOMException(ANALYSIS_TIMEOUT_MESSAGE, "TimeoutError")), ANALYSIS_TIMEOUT_MS),
    };
    analysisRuntimes.set(projectId, runtime);
    return { runId: runtime.runId, signal: runtime.controller.signal };
}

export function isCurrentEcommerceAnalysis(projectId: string, runId: string) {
    return analysisRuntimes.get(projectId)?.runId === runId;
}

export function finishEcommerceAnalysis(projectId: string, runId: string) {
    const runtime = analysisRuntimes.get(projectId);
    if (runtime?.runId !== runId) return;
    clearTimeout(runtime.timeoutId);
    analysisRuntimes.delete(projectId);
}

export function cancelEcommerceAnalysis(projectId: string) {
    const runtime = analysisRuntimes.get(projectId);
    if (!runtime) return;
    clearTimeout(runtime.timeoutId);
    analysisRuntimes.delete(projectId);
    runtime.controller.abort(new DOMException("分析输入已变化", "AbortError"));
}

export function ecommerceAnalysisError(signal: AbortSignal, error: unknown) {
    return classifyEcommerceAnalysisFailure(signal, error).errorText;
}

export function classifyEcommerceAnalysisFailure(signal: AbortSignal, error: unknown): { category: EcommerceAnalysisFailureCategory; errorText: string; schemaIssues?: EcommerceSchemaIssue[] } {
    if (signal.aborted && signal.reason instanceof DOMException && signal.reason.name === "TimeoutError") return { category: "timeout", errorText: ANALYSIS_TIMEOUT_MESSAGE };
    if (signal.aborted || error instanceof DOMException && error.name === "AbortError") {
        const reason = signal.aborted ? signal.reason : error;
        return { category: "stale_or_aborted", errorText: reason instanceof Error ? reason.message : "分析已中止或结果已失效" };
    }
    if (error instanceof StructuredOutputError) return { category: "structured_output", errorText: error.message };
    if (error instanceof EcommercePlanError) return { category: error.code, errorText: error.message, schemaIssues: error.schemaIssues };
    return { category: "network", errorText: error instanceof Error ? error.message : "分析请求失败" };
}
