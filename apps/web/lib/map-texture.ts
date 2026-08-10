import {
  LinearFilter,
  SRGBColorSpace,
  Texture,
} from "three";

export type LoadedMapTexture = {
  texture: Texture;
  width: number;
  height: number;
};

export function loadMapTexture(url: string): Promise<LoadedMapTexture> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Map textures can only be loaded in a browser."));
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.onload = () => {
      const texture = new Texture(image);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      resolve({ texture, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => reject(new Error("The map background could not be loaded."));
    image.src = url;
  });
}
