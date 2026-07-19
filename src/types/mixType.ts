/**
 * ミックス（声のみ音源 + トラック音源の合成）関連の共有型 (TASK-49)
 */

/** ミックス処理の進行状態 */
export type MixStatus = 'none' | 'processing' | 'done' | 'failed';
