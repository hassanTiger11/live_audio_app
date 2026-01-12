import './globals.css'

export const metadata = {
  title: 'Real-Time Speech Transcription',
  description: 'Browser-based real-time speech transcription using OpenAI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  )
}
