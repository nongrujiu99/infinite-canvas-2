const activeVersions = new Set<string>();
const activeTasks = new Set<string>();

export function markEcommerceRuntime(versionId: string, active: boolean) {
    if (active) activeVersions.add(versionId);
    else activeVersions.delete(versionId);
}

export function markEcommerceTaskController(versionId: string, taskId: string, active: boolean) {
    const key = `${versionId}:${taskId}`;
    if (active) activeTasks.add(key);
    else activeTasks.delete(key);
}

export function hasActiveEcommerceRuntime(versionId: string) {
    return activeVersions.has(versionId) || [...activeTasks].some((key) => key.startsWith(`${versionId}:`));
}

export function hasActiveEcommerceTask(versionId: string, taskId: string) {
    return activeTasks.has(`${versionId}:${taskId}`);
}
