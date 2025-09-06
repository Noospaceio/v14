import dynamic from 'next/dynamic'
const Noospace = dynamic(() => import('../components/Noospace'), { ssr: false })

export default function Home() {
  // Landing simply redirects to /app which mounts the Noospace (preserves v8 look)
  if (typeof window !== 'undefined') {
    // if query param ?mode=guest or ?mode=wallet is present, pass it along to /app
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode) {
      window.location.href = '/app' + (mode ? ('?mode=' + mode) : '');
    } else {
      // show Noospace directly (legacy behavior)
    }
  }

  return <Noospace />
}
