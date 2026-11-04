import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'./',plugins:[react(),tailwindcss()],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 define:{'process.env.FT_READ_ONLY':JSON.stringify(process.env.FT_READ_ONLY||'')},build:{outDir:'dist',chunkSizeWarningLimit:2000}});
