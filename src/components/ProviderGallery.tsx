import { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, X, Plus, Image as ImageIcon, Loader2 } from 'lucide-react';
import { api, resolveAssetUrl } from '@/lib/api';
import { toast } from 'sonner';

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string;
  created_at: string;
}

interface ProviderGalleryProps {
  providerId: string;
  editable?: boolean;
}

export function ProviderGallery({ providerId, editable = false }: ProviderGalleryProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<GalleryImage[]>(`/provider/gallery/${providerId}`);
      setImages((res.data as GalleryImage[]) || []);
    } catch {
      // Gallery may not exist yet
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => { fetchGallery(); }, [fetchGallery]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 5MB limit`);
          continue;
        }
        const formData = new FormData();
        formData.append('image', file);
        formData.append('caption', '');
        await api.upload('/provider/gallery', formData);
      }
      toast.success('Photos uploaded!');
      fetchGallery();
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (imageId: string) => {
    try {
      await api.delete(`/provider/gallery/${imageId}`);
      setImages(prev => prev.filter(img => img.id !== imageId));
      toast.success('Photo removed');
    } catch {
      toast.error('Failed to remove photo');
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!editable && images.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Camera className="h-4 w-4 text-muted-foreground" />
          Work Gallery
          {images.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({images.length})</span>
          )}
        </h3>
        {editable && (
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg cursor-pointer hover:opacity-90 transition-opacity active:scale-[0.97]">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {uploading ? 'Uploading…' : 'Add Photos'}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {images.length === 0 && editable && (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full py-8 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors active:scale-[0.98]"
        >
          <ImageIcon className="h-8 w-8 opacity-40" />
          <span className="text-xs font-medium">Upload photos of your work to attract more users</span>
        </button>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer"
              onClick={() => setLightbox(idx)}
            >
              <img
                src={resolveAssetUrl(img.image_url)}
                alt={img.caption || 'Work sample'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              {editable && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                  className="absolute top-1 right-1 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-[0.95]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && images[lightbox] && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 z-[61] h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={resolveAssetUrl(images[lightbox].image_url)}
            alt={images[lightbox].caption || 'Work sample'}
            className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          {images[lightbox].caption && (
            <p className="absolute bottom-6 text-white/80 text-sm text-center">{images[lightbox].caption}</p>
          )}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightbox(i); }}
                  className={`h-2 w-2 rounded-full transition-colors ${i === lightbox ? 'bg-white' : 'bg-white/30'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
