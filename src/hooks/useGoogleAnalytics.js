import { useEffect } from 'react';

export const useGoogleAnalytics = (hasConsent) => {
  useEffect(() => {
    // Only run if consent has been given
    if (hasConsent) {
      // For Vite, environment variables are exposed on import.meta.env
      // Ensure you have a .env file in your project root with:
      // VITE_GA_TRACKING_ID="your-id"
      const trackingId = import.meta.env.VITE_GA_TRACKING_ID;

      if (trackingId) {
        // Avoid adding script if it already exists (e.g., during development hot reloads)
        if (document.querySelector(`script[src*="${trackingId}"]`)) {
          return;
        }

        const script1 = document.createElement('script');
        script1.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
        script1.async = true;

        const script2 = document.createElement('script');
        script2.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${trackingId}');
        `;

        document.head.appendChild(script1);
        document.head.appendChild(script2);

        // No cleanup function is strictly necessary here, as we want analytics to persist.
      }
    }
  }, [hasConsent]); // This effect now depends on the consent state
};
