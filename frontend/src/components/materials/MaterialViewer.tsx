import type { PraiseMaterialResponse } from '@/types';

interface MaterialViewerProps {
  material: PraiseMaterialResponse;
}

export const MaterialViewer = ({ material }: MaterialViewerProps) => {
  if (material.type === 'youtube') {
    // Extrair ID do YouTube da URL
    const youtubeId = material.path.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/
    )?.[1];

    if (youtubeId) {
      return (
        <div className="aspect-video">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${youtubeId}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="rounded-lg"
          />
        </div>
      );
    }
    return (
      <a
        href={material.path}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        {material.path}
      </a>
    );
  }

  if (material.type === 'spotify') {
    // Extrair ID do Spotify da URL
    const spotifyId = material.path.match(/spotify\.com\/track\/([^?]+)/)?.[1];

    if (spotifyId) {
      return (
        <iframe
          src={`https://open.spotify.com/embed/track/${spotifyId}`}
          width="100%"
          height="352"
          frameBorder="0"
          allow="encrypted-media"
          className="rounded-lg"
        />
      );
    }
    return (
      <a
        href={material.path}
        target="_blank"
        rel="noopener noreferrer"
        className="text-green-600 hover:underline"
      >
        {material.path}
      </a>
    );
  }

  if (material.type === 'text') {
    return (
      <div className="bg-gray-50 p-4 rounded-md">
        <pre className="whitespace-pre-wrap text-sm">{material.path}</pre>
      </div>
    );
  }

  // FILE type - mostrar link para download
  return (
    <div className="text-center">
      <p className="text-gray-600 mb-2">Arquivo: {material.path}</p>
      <a
        href={material.path}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        Abrir/Download
      </a>
    </div>
  );
};
