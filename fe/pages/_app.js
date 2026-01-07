import "../styles/globals.css";
import 'leaflet/dist/leaflet.css';
import { AppProvider } from "../contexts/AppContext";
import Head from 'next/head';

function MyApp({ Component, pageProps }) {
  return (
    <AppProvider>
      <Component {...pageProps} />
    </AppProvider>
  );
}

export default MyApp;

