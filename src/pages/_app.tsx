import type { AppProps } from "next/app";
import "@/styles/globals.css";
import { ThirdwebProvider } from "thirdweb/react";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
{
  return (
    <>
      <Head>
        <title>W FACTORY | PHYGITAL WEAR</title>

        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#00ff88" />
      </Head>

      <Component {...pageProps} />
    </>
  );
}

}
