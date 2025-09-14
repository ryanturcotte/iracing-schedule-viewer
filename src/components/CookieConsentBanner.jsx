import React from 'react';
import CookieConsent from 'react-cookie-consent';

const CookieConsentBanner = ({ onAccept }) => {
  return (
    <CookieConsent
      location="bottom"
      buttonText="I understand"
      cookieName="cookie-consent-given" // This cookie is used to remember the user's choice
      style={{ background: '#2B373B', fontSize: '14px' }}
      contentStyle={{ display: 'flex', alignItems: 'center' }}
      enableDeclineButton
      declineButtonText="Decline"
      declineButtonStyle={{
        background: '#6b7280', // A neutral gray
        color: 'white',
        fontSize: '14px',
        fontWeight: 'bold',
        borderRadius: '8px',
      }}
      buttonStyle={{
        background: '#3b82f6',
        color: 'white',
        fontSize: '14px',
        fontWeight: 'bold',
        borderRadius: '8px',
      }}
      setDeclineCookie={false}
      expires={365} // Remember consent for a year
      onAccept={onAccept}
      onDecline={() => {
        window.location.href = 'https://github.com/ryanturcotte/iracing-schedule-viewer';
      }}
    >
      <span role="img" aria-label="cookie" style={{ fontSize: '24px', marginRight: '15px' }}>🍪</span>
      <span>
        This website uses cookies to save series selections and other necessary variables. It uses Google Analytics to track usage.
      </span>
    </CookieConsent>
  );
};

export default CookieConsentBanner;