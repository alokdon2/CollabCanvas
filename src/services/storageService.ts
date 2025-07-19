// src/services/storageService.ts
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Uploads an image blob to Firebase Storage.
 * @param {Blob} imageBlob The image data as a Blob.
 * @param {string} userId The ID of the user uploading the image.
 * @returns {Promise<string>} A promise that resolves with the public download URL of the uploaded image.
 */
export async function uploadImage(imageBlob: Blob, userId: string): Promise<string> {
  if (!userId) {
    throw new Error("User must be authenticated to upload images.");
  }
  if (!imageBlob) {
    throw new Error("No image data provided.");
  }

  // Generate a unique filename using the native Crypto API
  const fileExtension = imageBlob.type.split('/')[1] || 'png';
  const fileName = `${crypto.randomUUID()}.${fileExtension}`;
  const storagePath = `user-uploads/${userId}/images/${fileName}`;

  const storageRef = ref(storage, storagePath);

  try {
    const snapshot = await uploadBytes(storageRef, imageBlob);
    console.log('Uploaded a blob or file!', snapshot);

    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('File available at', downloadURL);

    return downloadURL;
  } catch (error) {
    console.error("Error uploading image to Firebase Storage:", error);
    throw new Error("Image upload failed. Please try again.");
  }
}

/**
 * Converts a data URI (e.g., from a <canvas> or FileReader) to a Blob.
 * @param {string} dataURI The data URI to convert.
 * @returns {Blob} The resulting blob object.
 */
export function dataURIToBlob(dataURI: string): Blob {
  // convert base64 to raw binary data held in a string
  const byteString = atob(dataURI.split(',')[1]);

  // separate out the mime component
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

  // write the bytes of the string to an ArrayBuffer
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type: mimeString });
}
