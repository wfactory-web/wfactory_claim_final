// src/pages/_app.tsx
import type { AppProps } from "next/app";
import "@/styles/globals.css";

import { ThirdwebProvider } from "thirdweb/react";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThirdwebProvider>
      <Head>
        <title>W FACTORY | PHYGITAL WEAR</title>

        {/* Browser tab icon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />

        {/* iOS home screen */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* Theme color */}
        <meta name="theme-color" content="#00ff88" />
      </Head>

      <Component {...pageProps} />
    </ThirdwebProvider>
  );
}
