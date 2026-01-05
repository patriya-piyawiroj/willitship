/**
 * Upload Page Component
 */

import { state } from '../state.js';

export class UploadPage {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        this.render();
        this.setupEventListeners();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="upload-page">
                <div class="page-header">
                    <button class="back-btn" id="back-btn">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        Back
                    </button>
                    <h2 class="page-title">Upload eBL Document</h2>
                </div>
                
                <div class="upload-container">
                    <div class="upload-area" id="upload-area">
                        <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <p class="upload-text">Click to upload or drag and drop</p>
                        <p class="upload-hint">PNG, JPG, PDF up to 10MB</p>
                        <input type="file" id="file-input" accept="image/*,.pdf" style="display: none;">
                    </div>
                    
                    <div class="preview-container" id="preview-container" style="display: none;">
                        <img id="preview-image" src="" alt="Preview">
                        <button class="remove-btn" id="remove-btn">Remove</button>
                    </div>
                    
                    <button class="submit-btn" id="upload-submit-btn">
                        Submit
                        <svg class="btn-icon-right" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    setupEventListeners() {
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const previewContainer = document.getElementById('preview-container');
        const previewImage = document.getElementById('preview-image');
        const removeBtn = document.getElementById('remove-btn');
        const submitBtn = document.getElementById('upload-submit-btn');
        const backBtn = document.getElementById('back-btn');
        
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            });
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
        }
        
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                if (fileInput) fileInput.value = '';
                if (previewContainer) previewContainer.style.display = 'none';
                if (uploadArea) uploadArea.style.display = 'block';
            });
        }
        
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                state.set('currentRoute', 'form');
            });
        }
        
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                state.set('currentRoute', 'home');
            });
        }
    }
    
    handleFileSelect(file) {
        const uploadArea = document.getElementById('upload-area');
        const previewContainer = document.getElementById('preview-container');
        const previewImage = document.getElementById('preview-image');
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (previewImage) previewImage.src = e.target.result;
                if (uploadArea) uploadArea.style.display = 'none';
                if (previewContainer) previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            if (uploadArea) uploadArea.style.display = 'none';
            if (previewContainer) previewContainer.style.display = 'block';
            if (previewImage) {
                previewImage.src = '';
                previewImage.alt = file.name;
            }
        }
    }
    
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
