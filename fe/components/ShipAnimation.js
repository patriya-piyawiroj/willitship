import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';

export default function ShipAnimation({ className = '' }) {
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    // Load the Lottie animation JSON file from public directory
    fetch('/sailing_ship.json')
      .then(response => response.json())
      .then(data => setAnimationData(data))
      .catch(error => {
        console.error('Error loading Lottie animation:', error);
      });
  }, []);

  if (!animationData) {
    return <div className={className} />;
  }

  return (
    <div className={className}>
      <Lottie
        animationData={animationData}
        loop={true}
        autoplay={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

