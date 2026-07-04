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
     * Update a track title
     * @param id
     * @param requestBody
     * @returns any OK
     * @throws ApiError
     */
    public static updateTrack(
        id: string,
        requestBody: {
            title: string;
        },
    ): CancelablePromise<{
        id?: string;
        title?: string;
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
        updatedAt?: string;
        isBookmarked?: boolean;
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
