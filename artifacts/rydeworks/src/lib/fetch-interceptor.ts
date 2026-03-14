/**
 * Intercepts all fetch requests to /api and automatically attaches the
 * JWT token from localStorage if it exists.
 */
export function setupFetchInterceptor() {
  const originalFetch = window.fetch;
  
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
    
    // Only intercept requests to our API
    if (url.startsWith('/api')) {
      const token = localStorage.getItem('rydeworks_token');
      
      if (token) {
        init = init || {};
        init.headers = {
          ...init.headers,
          'Authorization': `Bearer ${token}`
        };
      }
    }
    
    // Process the request
    const response = await originalFetch(input, init);
    
    // Handle unauthorized globally
    if (response.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('rydeworks_token');
      window.location.href = '/login';
    }
    
    return response;
  };
}
