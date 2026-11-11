'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="center-screen"><h1>We couldn’t open the terminal.</h1><p>Check your connection and try again.</p><button className="button button-primary" onClick={reset}>Try again</button></div>;}
