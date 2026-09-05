/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * Get all data
     * Returns all mock data defined in /src/data directory.
     * @returns any OK
     * @throws ApiError
     */
    public static getData(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data',
        });
    }
    /**
     * Get project data
     * Returns mock data for PROJECT_DATA.
     * @returns any OK
     * @throws ApiError
     */
    public static getProject(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/project',
        });
    }
    /**
     * Create a new project
     * @param requestBody
     * @returns any Created
     * @throws ApiError
     */
    public static createProject(
        requestBody: {
            projectName: string;
            trackName?: string;
            trackId?: string;
            artworkKey?: string;
        },
    ): CancelablePromise<{
        id?: string;
        projectName?: string;
        createdAt?: string;
        updatedAt?: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/project',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get project detail
     * Returns a single project by ID.
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static getDataProject(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/project/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update project
     * Updates body (lyrics) and cueButtons for a project.
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static putDataProject(
        id: string,
        requestBody: {
            projectName?: string;
            body?: string;
            cueButtons?: Array<Record<string, any>>;
            artworkKey?: string;
            trackId?: string;
            trackName?: string;
        },
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/data/project/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Delete project
     * Deletes a project and its associated S3 assets.
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static deleteDataProject(
        id: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/data/project/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Get record list for a specific project
     * Returns record list data associated with a specific project.
     * @param id Project ID
     * @returns any OK
     * @throws ApiError
     */
    public static getDataProjectRecords(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/project/{id}/records',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get profile data
     * Returns mock data for PROFILE_DATA.
     * @returns any OK
     * @throws ApiError
     */
    public static getProfile(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/profile',
        });
    }
    /**
     * Update profile
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static updateProfile(
        requestBody: {
            username?: string;
            email?: string;
            thumbnailKey?: string;
            socialAccounts?: Array<{
                provider?: string;
                username?: string;
                isLinked?: boolean;
            }>;
        },
    ): CancelablePromise<{
        username?: string;
        email?: string;
        thumbnail?: string;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/data/profile',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Delete account and all user data
     * Permanently deletes the authenticated user's account and all associated data (projects, tracks, records, memos, and S3 files).
     * @returns any OK
     * @throws ApiError
     */
    public static deleteProfile(): CancelablePromise<{
        success?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/data/profile',
            errors: {
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Get memo data
     * Returns mock data for MEMO_DATA.
     * @returns any OK
     * @throws ApiError
     */
    public static getMemo(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/memo',
        });
    }
    /**
     * Create a new memo
     * @param requestBody
     * @returns any Created
     * @throws ApiError
     */
    public static createMemo(
        requestBody: {
            title: string;
            body?: string;
            isBookmarked?: boolean;
        },
    ): CancelablePromise<{
        id?: string;
        title?: string;
        body?: string;
        createdAt?: string;
        updatedAt?: string;
        isBookmarked?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/memo',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Update a memo
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static updateMemo(
        id: string,
        requestBody: {
            title?: string;
            body?: string;
            isBookmarked?: boolean;
        },
    ): CancelablePromise<{
        id?: string;
        title?: string;
        body?: string;
        updatedAt?: string;
        isBookmarked?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/data/memo/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Delete a memo
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static deleteMemo(
        id: string,
    ): CancelablePromise<{
        success?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/data/memo/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Get presigned S3 upload URL for a track file
     * @param filename
     * @param contentType
     * @returns any OK
     * @throws ApiError
     */
    public static getTrackUploadUrl(
        filename: string,
        contentType: string,
    ): CancelablePromise<{
        uploadUrl?: string;
        key?: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/track/upload-url',
            query: {
                'filename': filename,
                'contentType': contentType,
            },
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get track data
     * Returns mock data for TRACK_DATA.
     * @returns any OK
     * @throws ApiError
     */
    public static getTrack(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/track',
        });
    }
    /**
     * Create a new track
     * @param requestBody
     * @returns any Created
     * @throws ApiError
     */
    public static createTrack(
        requestBody: {
            title: string;
            s3Key: string;
            extention: string;
        },
    ): CancelablePromise<{
        id?: string;
        title?: string;
        s3Key?: string;
        extention?: string;
        linkedProjects?: Array<string>;
        createdAt?: string;
        updatedAt?: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/track',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Update a track (title / artwork)
     * title と artworkKey のどちらか一方、または両方を指定して更新する。
     * artworkKey を差し替えた場合、旧アートワークの S3 オブジェクトは削除される。
     *
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static updateTrack(
        id: string,
        requestBody: {
            title?: string;
            artworkKey?: string;
        },
    ): CancelablePromise<{
        id?: string;
        title?: string;
        artworkKey?: string;
        updatedAt?: string;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/data/track/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Delete a track
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static deleteTrack(
        id: string,
    ): CancelablePromise<{
        success?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/data/track/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Get presigned S3 upload URL for a record file
     * @param filename
     * @param contentType
     * @returns any OK
     * @throws ApiError
     */
    public static getRecordUploadUrl(
        filename: string,
        contentType: string,
    ): CancelablePromise<{
        uploadUrl?: string;
        key?: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/record/upload-url',
            query: {
                'filename': filename,
                'contentType': contentType,
            },
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get record data
     * Returns mock data for RECORD_DATA.
     * @returns any OK
     * @throws ApiError
     */
    public static getRecord(): CancelablePromise<Array<{
        id?: string;
        title?: string;
        source?: string;
        projectId?: string;
        startPositionMs?: number;
        createdAt?: string;
        updatedAt?: string;
        isBookmarked?: boolean;
        recordedWithHeadphones?: 'wired' | 'bluetooth' | 'none';
        separationStatus?: 'none' | 'processing' | 'done' | 'failed';
        separationType?: 'separate' | 'denoise';
        separatedSource?: string;
    }>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/record',
        });
    }
    /**
     * Create a new record
     * @param requestBody
     * @returns any Created
     * @throws ApiError
     */
    public static createRecord(
        requestBody: {
            title?: string;
            s3Key: string;
            projectId?: string;
            startPositionMs?: number;
            isBookmarked?: boolean;
            recordedWithHeadphones?: 'wired' | 'bluetooth' | 'none';
        },
    ): CancelablePromise<{
        id?: string;
        title?: string;
        source?: string;
        projectId?: string;
        startPositionMs?: number;
        createdAt?: string;
        updatedAt?: string;
        isBookmarked?: boolean;
        recordedWithHeadphones?: 'wired' | 'bluetooth' | 'none';
        separationStatus?: 'none' | 'processing' | 'done' | 'failed';
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/record',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Start AI cleanup (vocal separation / denoise) for a record
     * Starts an AI cleanup job for the recorded audio. The processing type (separate / denoise) is chosen automatically from the headphone connection state at recording time. If the record has already been processed, the cached result is returned without starting a new job.
     *
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static separateRecord(
        id: string,
    ): CancelablePromise<{
        id?: string;
        separationStatus?: 'none' | 'processing' | 'done' | 'failed';
        separationType?: 'separate' | 'denoise';
        separatedSource?: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/record/{id}/separate',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                404: `Not Found`,
                502: `Bad Gateway (failed to start the AI cleanup job)`,
                503: `Service Unavailable (AI cleanup is not configured)`,
            },
        });
    }
    /**
     * Get AI cleanup status for a record
     * Polls the AI cleanup job status. When the job has finished, the processed audio is stored in S3 and a presigned URL is returned.
     *
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static getRecordSeparateStatus(
        id: string,
    ): CancelablePromise<{
        id?: string;
        separationStatus?: 'none' | 'processing' | 'done' | 'failed';
        separationType?: 'separate' | 'denoise';
        separatedSource?: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/record/{id}/separate-status',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                404: `Not Found`,
                503: `Service Unavailable (AI cleanup is not configured)`,
            },
        });
    }
    /**
     * Start mixing the separated vocals with the project track audio
     * Starts a server-side mix (ffmpeg) of the AI-cleaned vocals and the project track audio, aligned with the recording start position. If the record has already been mixed with the same sources, the cached result is returned without starting a new job.
     *
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static mixRecord(
        id: string,
    ): CancelablePromise<{
        id?: string;
        mixStatus?: 'none' | 'processing' | 'done' | 'failed';
        mixedSource?: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/record/{id}/mix',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad Request (no separated audio, record not linked to a project, or the project has no track audio)`,
                401: `Unauthorized`,
                404: `Not Found`,
                502: `Bad Gateway (failed to start the mix job)`,
            },
        });
    }
    /**
     * Get mix status for a record
     * Polls the mix job status. When the job has finished, the mixed audio is stored in S3 and a presigned URL is returned.
     *
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static getRecordMixStatus(
        id: string,
    ): CancelablePromise<{
        id?: string;
        mixStatus?: 'none' | 'processing' | 'done' | 'failed';
        mixedSource?: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/record/{id}/mix-status',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Update a record
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static updateRecord(
        id: string,
        requestBody: {
            title?: string;
            isBookmarked?: boolean;
        },
    ): CancelablePromise<{
        id?: string;
        title?: string;
        source?: string;
        updatedAt?: string;
        isBookmarked?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/data/record/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Delete a record
     * @param id
     * @returns any OK
     * @throws ApiError
     */
    public static deleteRecord(
        id: string,
    ): CancelablePromise<{
        success?: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/data/record/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                404: `Not Found`,
            },
        });
    }
    /**
     * Mock login authentication
     * Returns user authentication mock data (email & password).
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static postDataAuthLogin(
        requestBody: {
            email?: string;
            password?: string;
        },
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Mock logout
     * Returns a success message for logout.
     * @returns any OK
     * @throws ApiError
     */
    public static postDataAuthLogout(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/auth/logout',
        });
    }
    /**
     * Refresh access token
     * Issues a new token pair from a valid refresh token.
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static postDataAuthRefresh(
        requestBody: {
            refreshToken: string;
        },
    ): CancelablePromise<{
        token?: {
            accessToken?: string;
            refreshToken?: string;
            expiresIn?: number;
        };
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/auth/refresh',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Register a new user
     * @param requestBody
     * @returns any Created
     * @throws ApiError
     */
    public static postDataAuthRegister(
        requestBody: {
            username: string;
            email: string;
            password: string;
        },
    ): CancelablePromise<{
        userId?: string;
        username?: string;
        email?: string;
        thumbnail?: string | null;
        socialAccounts?: Array<Record<string, any>>;
        token?: {
            accessToken?: string;
            refreshToken?: string;
            expiresIn?: number;
        };
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/auth/register',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                409: `Email already in use`,
            },
        });
    }
    /**
     * Link a Google account to the signed-in user
     * Verifies a Google OAuth access token and stores the Google account id (sub) on the signed-in user, so the linked Google account can sign in to this user afterwards.
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static postDataProfileLinkGoogle(
        requestBody: {
            /**
             * Google OAuth access token obtained on the device
             */
            accessToken: string;
        },
    ): CancelablePromise<{
        linked?: boolean;
        name?: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/profile/link-google',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
                409: `Google account already linked to another user`,
            },
        });
    }
    /**
     * Sign in with a Google account
     * Verifies a Google OAuth access token, creates the user automatically if the email is not registered yet, and returns the same auth payload as login.
     * @param requestBody
     * @returns any OK (existing user signed in)
     * @throws ApiError
     */
    public static postDataAuthGoogle(
        requestBody: {
            /**
             * Google OAuth access token obtained on the device
             */
            accessToken: string;
            /**
             * login (SignIn screen) returns 404 when no account matches; register (Register screen) creates a new account automatically
             */
            mode?: 'login' | 'register';
        },
    ): CancelablePromise<{
        userId?: string;
        username?: string;
        email?: string;
        thumbnail?: string | null;
        socialAccounts?: Array<Record<string, any>>;
        token?: {
            accessToken?: string;
            refreshToken?: string;
            expiresIn?: number;
        };
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/auth/google',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Invalid Google access token`,
                404: `Account not found (mode=login and no matching user)`,
            },
        });
    }
    /**
     * Reset user password
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static postDataAuthResetPassword(
        requestBody: {
            email: string;
            newPassword: string;
        },
    ): CancelablePromise<{
        message?: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/data/auth/reset-password',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                404: `User not found`,
            },
        });
    }
}
