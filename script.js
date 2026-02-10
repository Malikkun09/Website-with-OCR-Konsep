// --- Variables ---
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const processBtn = document.getElementById('processBtn');
    const resetBtn = document.getElementById('resetBtn');
    const copyBtn = document.getElementById('copyBtn');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    const resultText = document.getElementById('resultText');
    const progressBar = document.getElementById('progressBar');
    const progressContainer = document.getElementById('progressContainer');
    const statusText = document.getElementById('statusText');
    const confidenceScore = document.getElementById('confidenceScore');
    
    // Controls
    const langSelect = document.getElementById('langSelect');
    const resizeSelect = document.getElementById('resizeToggle');
    const grayscaleCheck = document.getElementById('grayscaleCheck');
    const binarizeCheck = document.getElementById('binarizeCheck');

    let originalImage = null; // Menyimpan Image Object asli
    let isProcessing = false;

    // --- Event Listeners ---

    // Drag & Drop
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Controls Change
    [resizeSelect, grayscaleCheck, binarizeCheck].forEach(el => {
        el.addEventListener('change', () => {
            if (originalImage) renderImageToCanvas();
        });
    });

    processBtn.addEventListener('click', runOCR);
    resetBtn.addEventListener('click', resetAll);
    copyBtn.addEventListener('click', () => {
        resultText.select();
        document.execCommand('copy');
        alert("Teks berhasil disalin!");
    });

    // --- Core Functions ---

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert("Mohon upload file gambar (JPG, PNG).");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                processBtn.disabled = false;
                statusText.textContent = "Gambar dimuat. Siap diproses.";
                renderImageToCanvas();
                resultText.value = "";
                confidenceScore.textContent = "";
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Fungsi untuk merender gambar ke canvas dengan resize dan filter (Optimasi CPU ada di sini)
    function renderImageToCanvas() {
        if (!originalImage) return;

        // 1. Tentukan Ukuran Baru (Downsampling untuk Low-End CPU)
        const maxDimension = parseInt(resizeSelect.value) || 0;
        let width = originalImage.width;
        let height = originalImage.height;

        if (maxDimension > 0 && (width > maxDimension || height > maxDimension)) {
            if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
            } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
            }
        }

        canvas.width = width;
        canvas.height = height;

        // 2. Gambar original ke canvas
        ctx.drawImage(originalImage, 0, 0, width, height);

        // 3. Terapkan Filter Preprocessing
        if (grayscaleCheck.checked || binarizeCheck.checked) {
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const threshold = 128; // Batas binarization

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Hitung kecerahan (luma)
                let avg = 0.299 * r + 0.587 * g + 0.114 * b;

                if (binarizeCheck.checked) {
                    // Binarization: Hitam atau Putih saja (Sangat membantu OCR teks kontras rendah)
                    avg = avg >= threshold ? 255 : 0;
                }
                // Jika hanya grayscale, avg sudah hitam putih tapi dengan gradasi

                data[i] = avg;     // R
                data[i + 1] = avg; // G
                data[i + 2] = avg; // B
            }
            ctx.putImageData(imageData, 0, 0);
        }

        canvas.style.display = 'block';
        document.querySelector('#previewContainer p').style.display = 'none';
    }

    async function runOCR() {
        if (isProcessing) return;
        isProcessing = true;
        processBtn.disabled = true;
        progressContainer.style.display = 'block';
        resultText.value = "";
        confidenceScore.textContent = "";

        // Bersihkan canvas dari kotak lama jika ada (kita render ulang image bersih)
        renderImageToCanvas();

        const lang = langSelect.value;

        try {
            statusText.textContent = "Inisialisasi Engine OCR (Mungkin butuh waktu saat pertama kali)...";

            // Tesseract.js v5 API - createWorker dengan parameter language
            const worker = await Tesseract.createWorker(lang, 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const percent = Math.round(m.progress * 100);
                        progressBar.style.width = percent + "%";
                        statusText.textContent = `Menganalisa Teks: ${percent}%`;
                    } else {
                        statusText.textContent = `Status: ${m.status}`;
                    }
                }
            });

            statusText.textContent = "Sedang memproses (Mengoptimalkan memori)...";

            // Kirim data gambar dari canvas (sudah dioptimasi ukurannya)
            const { data } = await worker.recognize(canvas);

            // Selesai
            resultText.value = data.text;
            confidenceScore.textContent = `Akurasi: ${Math.round(data.confidence)}%`;
            statusText.textContent = "Selesai!";
            progressBar.style.width = "100%";

            // Visualisasi Bounding Box
            drawBoundingBoxes(data.words);

            await worker.terminate();

        } catch (error) {
            console.error(error);
            statusText.textContent = "Error: " + error.message;
            alert("Terjadi kesalahan saat memproses. Mungkin RAM penuh atau gambar rusak.\nError: " + error.message);
        } finally {
            isProcessing = false;
            processBtn.disabled = false;
        }
    }

    function drawBoundingBoxes(words) {
        if (!words) return;

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#00ff00"; // Hijau terang
        ctx.font = "10px Arial";

        words.forEach(word => {
            if (word.confidence > 50) { // Hanya gambar kotak jika keyakinan > 50%
                const { x0, y0, x1, y1 } = word.bbox;
                ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
                
                // Opsional: Tampilkan tingkat akurasi kecil di atas kata
                // ctx.fillStyle = "#00ff00";
                // ctx.fillText(Math.round(word.confidence) + "%", x0, y0 - 2);
                // ctx.fillStyle = "#fff"; // Reset
            }
        });
    }

    function resetAll() {
        originalImage = null;
        fileInput.value = "";
        canvas.style.display = 'none';
        document.querySelector('#previewContainer p').style.display = 'block';
        resultText.value = "";
        confidenceScore.textContent = "";
        statusText.textContent = "Menunggu gambar...";
        progressContainer.style.display = "none";
        progressBar.style.width = "0%";
        processBtn.disabled = true;
    }
