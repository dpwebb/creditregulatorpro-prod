import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * Custom error types for API service.
 */
class ApiError extends Error {
    public status: number;
    public data: any;
    
    constructor(message: string, status: number, data: any) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

/**
 * Base API service class.
 */
class ApiService {
    private axiosInstance: AxiosInstance;

    constructor() {
        // 1) Base axios instance with timeout and default headers
        this.axiosInstance = axios.create({
            timeout: 10000, // 10 seconds timeout
            headers: {
                'Content-Type': 'application/json',
                // Add other headers if necessary
            }
        });

        // 2) Request interceptor for auth tokens and logging
        this.axiosInstance.interceptors.request.use(
            (config: AxiosRequestConfig) => {
                // Add auth token logic here
                const token = localStorage.getItem('authToken');
                if (token) {
                    config.headers['Authorization'] = `Bearer ${token}`;
                }
                console.log(`Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // 3) Response interceptor for error handling and retry logic
        this.axiosInstance.interceptors.response.use(
            (response: AxiosResponse) => {
                return response;
            },
            async (error) => {
                const originalRequest = error.config;
                const maxRetries = 3;
                let retryCount = 0;

                while (retryCount < maxRetries) {
                    retryCount++;
                    const backoff = Math.pow(2, retryCount) * 1000; // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, backoff));
                    try {
                        const response = await this.axiosInstance(originalRequest);
                        return response;
                    } catch (err) {
                        if (retryCount === maxRetries) {
                            throw new ApiError('Max retries reached', 500, err);
                        }
                    }
                }
                return Promise.reject(new ApiError('API call failed', error.response?.status || 500, error.response?.data));
            }
        );
    }

    // 5) Helper methods for common HTTP methods
    public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.axiosInstance.get<T>(url, config);
        return response.data;
    }

    public async post<T>(url: string, data: any, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.axiosInstance.post<T>(url, data, config);
        return response.data;
    }

    public async put<T>(url: string, data: any, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.axiosInstance.put<T>(url, data, config);
        return response.data;
    }

    public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.axiosInstance.delete<T>(url, config);
        return response.data;
    }
}

export default new ApiService();
