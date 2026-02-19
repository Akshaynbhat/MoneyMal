import axios from 'axios';

const API = axios.create({
    baseURL: '/api',
    timeout: 120000,
});

export async function analyzeFile(file, onProgress) {
    const form = new FormData();
    form.append('file', file);
    const res = await API.post('/analyze', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded / e.total) * 50));
            }
        },
    });
    return res.data;
}

export async function checkHealth() {
    const res = await API.get('/health');
    return res.data;
}
