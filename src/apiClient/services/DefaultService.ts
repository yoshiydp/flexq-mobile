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
     * Get record data
     * Returns mock data for RECORD_DATA.
     * @returns any OK
     * @throws ApiError
     */
    public static getRecord(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/data/record',
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
}
