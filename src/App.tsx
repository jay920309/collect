import React, { useState, useEffect, useRef } from 'react';
import { Camera, Archive, AlertTriangle, CheckCircle, X, Loader2, Save, Grid, Edit2, Trash2, ChevronDown, Search, Download, Upload, Settings } from 'lucide-react';
import { getSouvenirs, saveSouvenir, Souvenir, deleteSouvenir, updateSouvenir, setAllSouvenirs } from './lib/storage';
import { analyzeSouvenir, AnalysisResult } from './lib/gemini';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [souvenirs, setSouvenirs] = useState<Souvenir[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'collection' | 'scan'>('collection');
  
  // Edit states for the result (Scan flow)
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editFeatures, setEditFeatures] = useState('');
  const [editUserNote, setEditUserNote] = useState('');

  // Item Edit Modal
  const [editingItem, setEditingItem] = useState<Souvenir | null>(null);
  const [isConfirmingDeleteItem, setIsConfirmingDeleteItem] = useState(false);

  // Category selection and editing
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [isConfirmingDeleteCategory, setIsConfirmingDeleteCategory] = useState(false);
  
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(localStorage.getItem('GEMINI_CUSTOM_API_KEY') || '');
  const [apiKeyStatus, setApiKeyStatus] = useState<'missing' | 'custom' | 'system'>('missing');

  useEffect(() => {
    // Check key status on mount and when customApiKey changes
    const hasSystemKey = !!import.meta.env.VITE_GEMINI_API_KEY;
    const hasCustomKey = !!localStorage.getItem('GEMINI_CUSTOM_API_KEY');
    
    if (hasSystemKey) setApiKeyStatus('system');
    else if (hasCustomKey) setApiKeyStatus('custom');
    else setApiKeyStatus('missing');
  }, [isSettingsOpen]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const dataStr = JSON.stringify(souvenirs);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `souvenirs_backup_${new Date().toISOString().slice(0,10)}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
         await setAllSouvenirs(data);
         await loadSouvenirs();
         alert('匯入成功！您的資料已恢復。');
      } else {
         alert('檔案格式錯誤。');
      }
    } catch (err) {
      alert('匯入失敗，請確認檔案是否正確。');
    }
    if (importFileRef.current) importFileRef.current.value = '';
  };

  useEffect(() => {
    loadSouvenirs();
  }, []);

  const loadSouvenirs = async () => {
    const data = await getSouvenirs();
    setSouvenirs(data);
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    await updateSouvenir(editingItem);
    await loadSouvenirs();
    setEditingItem(null);
  };

  const handleDeleteItem = async (id: string) => {
    await deleteSouvenir(id);
    await loadSouvenirs();
    setEditingItem(null);
    setIsConfirmingDeleteItem(false);
  };

  const handleRenameCategory = async () => {
    if (!selectedCategory || selectedCategory === '全部') return;
    if (!editingCategoryName.trim()) return;
    
    const newItems = souvenirs.map(s => {
      if (s.category === selectedCategory) {
        return { ...s, category: editingCategoryName.trim() };
      }
      return s;
    });
    
    await setAllSouvenirs(newItems);
    await loadSouvenirs();
    setSelectedCategory(editingCategoryName.trim());
    setIsCategoryModalOpen(false);
  };

  const handleDeleteCategory = async () => {
    if (!selectedCategory || selectedCategory === '全部') return;
    const newItems = souvenirs.filter(s => s.category !== selectedCategory);
    await setAllSouvenirs(newItems);
    await loadSouvenirs();
    setSelectedCategory('All');
    setIsCategoryModalOpen(false);
    setIsConfirmingDeleteCategory(false);
  };

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(file.type, 0.8));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActiveTab('scan');
    setIsScanning(true);
    setResult(null);
    setCurrentImage(null);

    try {
      const dataUrl = await resizeImage(file);
      setCurrentImage(dataUrl);

      // Extract base64 without prefix
      const base64Data = dataUrl.split(',')[1];
      
      const analysis = await analyzeSouvenir(base64Data, file.type, souvenirs);
      setResult(analysis);
      setEditName(analysis.name);
      setEditCategory(analysis.category);
      setEditFeatures(analysis.features);
      setEditUserNote('');

    } catch (error: any) {
      console.error(error);
      const errMsg = error?.message || String(error);
      if (errMsg.toLowerCase().includes('quota') || errMsg.includes('429')) {
         const isUsingCustomKey = !!localStorage.getItem('GEMINI_CUSTOM_API_KEY');
         if (isUsingCustomKey) {
            alert('辨識失敗：您的「專屬 API Key」配額異常。\n\n1. 每日配額：免費版每天 1500 次。\n2. 每分鐘限制：每分鐘最多 15 次。\n\n如果您剛換新金鑰就看到這則訊息，可能是按太快了（每分鐘限制），請等 1 分鐘後再試一次。');
         } else {
            alert('辨識次數已達公共免費額度上限，請稍後再試。\n\n強烈建議您點擊右上角的「設定」圖示，並填入您申請的免費 API Key，即可擁有專屬的辨識額度！');
         }
      } else if (errMsg.includes('API_KEY_MISSING')) {
         alert('無法分析照片，因為缺少 Gemini API Key。\n\n如果您是從 GitHub Pages 使用，請點擊右上角的「設定」圖示並輸入您的 Gemini API Key。\n\n如果您是在 AI Studio 使用，建議回到 Google AI Studio 介面，按右上角的「Share」產生連結。透過 Share 連結分享，家人不需要設定 API Key 即可使用！');
      } else {
         alert('分析失敗，請重試。');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (!result || !currentImage) return;

    setIsSaving(true);
    const newSouvenir: Souvenir = {
      id: Date.now().toString(),
      name: editName,
      category: editCategory,
      features: editFeatures,
      userNote: editUserNote,
      date: new Date().toISOString(),
      imageUrl: currentImage,
    };

    await saveSouvenir(newSouvenir);
    await loadSouvenirs();
    setIsSaving(false);
    setActiveTab('collection');
    setResult(null);
    setCurrentImage(null);
    
    // Switch to the newly scanned category logic (optional but helpful)
    if (selectedCategory !== 'All' && selectedCategory !== editCategory) {
      setSelectedCategory('All');
    }
  };

  const categories = Array.from(new Set(souvenirs.map(s => s.category)));
  const visibleCategories = selectedCategory === '全部' ? categories : [selectedCategory];
  const searchLower = searchQuery.toLowerCase();

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex flex-col font-sans text-gray-800">
      <header className="bg-white border-b border-[#E8E8E0] px-4 py-4 sticky top-0 z-10 flex flex-col shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <h1 
              onClick={() => { setActiveTab('collection'); setResult(null); setCurrentImage(null); }}
              className="text-xl sm:text-2xl font-serif font-semibold text-[#3A3A2F] flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Archive className="w-5 h-5 sm:w-6 sm:h-6 text-[#5A5A40]" />
              <span className="hidden sm:inline">紀念品收藏管家</span>
            </h1>
            
            <div className="flex items-center gap-2 sm:ml-4 flex-wrap flex-1 justify-end sm:justify-start">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#5A5A40] hover:bg-[#3A3A2F] text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors duration-200 shadow-sm"
              >
                <Camera className="w-4 h-4" />
                <span>辨識</span>
              </button>
              
              <div className="flex items-center gap-1 border-l border-[#E8E8E0] pl-4 ml-2">
                <input type="file" ref={importFileRef} onChange={handleImport} accept=".json" className="hidden" />
                <button onClick={handleExport} className="p-2 text-[#8A8A75] hover:text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors" title="快速備份">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => importFileRef.current?.click()} className="p-2 text-[#8A8A75] hover:text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors" title="還原紀錄">
                  <Upload className="w-4 h-4" />
                </button>
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-[#8A8A75] hover:text-[#5A5A40] hover:bg-[#F5F5F0] rounded-full transition-colors relative" title="設定 API Key">
                  <Settings className="w-4 h-4" />
                  {apiKeyStatus === 'missing' && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                  )}
                  {apiKeyStatus === 'custom' && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></span>
                  )}
                </button>
              </div>
            </div>
          </div>
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden" 
          />
        </div>

        {activeTab === 'collection' && (
          <div className="mt-4 pt-3 border-t border-[#E8E8E0] flex items-center justify-between">
            <div className="flex items-center gap-2 relative">
              <select 
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent font-serif font-bold text-[#3A3A2F] text-lg focus:outline-none appearance-none pr-6 cursor-pointer"
              >
                <option value="全部">所有收藏 ({souvenirs.length})</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c} ({souvenirs.filter(s => s.category === c).length})</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#8A8A75] absolute right-0 pointer-events-none" />
            </div>

            <div className="flex items-center gap-4">
              {selectedCategory !== '全部' && selectedCategory && (
                <button 
                  onClick={() => {
                    setEditingCategoryName(selectedCategory);
                    setIsConfirmingDeleteCategory(false);
                    setIsCategoryModalOpen(true);
                  }}
                  className="text-[#8A8A75] hover:text-[#5A5A40] transition-colors"
                  aria-label="管理收藏庫"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              <input type="file" ref={importFileRef} onChange={handleImport} accept=".json" className="hidden" />
              <button 
                onClick={handleExport}
                className="text-[#8A8A75] hover:text-[#5A5A40] transition-colors"
                title="備份(下載)收藏紀錄"
              >
                <Download className="w-5 h-5" />
              </button>
              <button 
                onClick={() => importFileRef.current?.click()}
                className="text-[#8A8A75] hover:text-[#5A5A40] transition-colors"
                title="還原(上傳)收藏紀錄"
              >
                <Upload className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowSearch(!showSearch)} 
                className={`transition-colors ${showSearch ? 'text-[#3A3A2F]' : 'text-[#8A8A75] hover:text-[#5A5A40]'}`}
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </header>

      <AnimatePresence>
        {showSearch && activeTab === 'collection' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-3 border-b border-[#E8E8E0] bg-white overflow-hidden sticky top-[113px] sm:top-[128px] z-10 shadow-sm"
          >
            <div className="relative max-w-2xl mx-auto">
              <Search className="w-4 h-4 text-[#8A8A75] absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="搜尋收藏品名稱或特徵..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-full pl-9 pr-4 py-2 text-sm text-[#3A3A2F] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full pb-32">
        {activeTab === 'scan' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {currentImage && (
              <div className="bg-white p-2 rounded-[24px] shadow-[0_10px_30px_rgba(90,90,64,0.05)] border border-[#E8E8E0] overflow-hidden">
                <img src={currentImage} alt="Current" className="w-full h-64 object-cover rounded-2xl" />
              </div>
            )}

            {isScanning && (
              <div className="bg-white p-8 rounded-[24px] shadow-[0_10px_30px_rgba(90,90,64,0.05)] border border-[#E8E8E0] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 text-[#5A5A40] animate-spin" />
                <p className="text-[#8A8A75] font-medium animate-pulse">正在 AI 辨識中...</p>
              </div>
            )}

            {result && !isScanning && (
              <div className="space-y-6">
                {result.isDuplicate ? (
                  <div className="bg-[#FFF4E5] border border-[#FFD8A8] rounded-2xl p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-[#D9480F] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-[#D9480F] text-lg">⚠️ 偵測到重複！</h3>
                        <p className="text-[#D9480F]/90 text-sm mt-1 mb-3">這件商品已在您的「{result.category}」中。</p>
                        
                        {result.duplicateId && souvenirs.find(s => s.id === result.duplicateId) && (
                          <div className="bg-white/60 rounded-xl p-3 border border-[#FFD8A8]/50">
                            {(() => {
                              const dup = souvenirs.find(s => s.id === result.duplicateId);
                              return (
                                <div className="flex items-center gap-3">
                                  {dup?.imageUrl ? (
                                    <img src={dup.imageUrl} className="w-12 h-12 rounded-lg object-cover border border-[#E8E8E0]" />
                                  ) : (
                                    <div className="w-12 h-12 bg-[#FFD8A8]/30 rounded flex items-center justify-center border border-[#FFD8A8]/30"><Archive className="w-5 h-5 text-[#D9480F]/60" /></div>
                                  )}
                                  <div>
                                    <p className="font-semibold text-[#3A3A2F] text-sm">{dup?.name}</p>
                                    <p className="text-xs text-[#8A8A75] font-medium mt-0.5 line-clamp-1">{dup?.date && new Date(dup.date).toLocaleDateString()}</p>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-[#E8E8E0] rounded-2xl p-5 shadow-[0_10px_30px_rgba(90,90,64,0.05)]">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-6 h-6 text-[#5A5A40] shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-serif font-bold text-[#3A3A2F] text-xl">✨ 這是新發現！</h3>
                        <p className="text-[#8A8A75] text-sm mt-1">要將它加入您的收藏庫嗎？</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white border border-[#E8E8E0] rounded-[24px] overflow-hidden shadow-[0_10px_30px_rgba(90,90,64,0.05)]">
                  <div className="px-6 py-5 border-b border-[#E8E8E0] bg-[#F9F9F7]">
                    <h4 className="font-serif font-semibold text-xl text-[#3A3A2F] flex items-center justify-between">
                      AI 辨識結果
                      <span className="text-[10px] px-2.5 py-1 bg-[#5A5A40] text-white rounded font-bold tracking-widest uppercase">可編輯</span>
                    </h4>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">名稱</label>
                      <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30 focus:border-[#5A5A40] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">分類</label>
                      <input 
                        type="text" 
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30 focus:border-[#5A5A40] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">特徵</label>
                      <textarea 
                        value={editFeatures}
                        onChange={(e) => setEditFeatures(e.target.value)}
                        rows={3}
                        className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#5A5A40] italic leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30 focus:border-[#5A5A40] transition-colors resize-none"
                      />
                      <p className="serif text-center italic text-[#5A5A40] mt-3 text-sm">「以上特徵辨識正確嗎？如有錯誤請直接修改。」</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">個人備註 (選填)</label>
                      <input 
                        type="text" 
                        value={editUserNote}
                        onChange={(e) => setEditUserNote(e.target.value)}
                        placeholder="例如：在京都清水寺買的"
                        className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30 focus:border-[#5A5A40] transition-colors"
                      />
                    </div>
                  </div>
                  <div className="px-6 py-5 bg-[#F9F9F7] border-t border-[#E8E8E0] flex gap-3">
                    <button 
                      onClick={() => setActiveTab('collection')}
                      className="flex-1 px-4 py-3 rounded-full text-[#5A5A40] text-sm font-semibold border border-[#D9D9C3] bg-white hover:bg-[#F5F5F0] transition-colors text-center"
                    >
                      取消
                    </button>
                    {!result.isDuplicate && (
                      <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 bg-[#5A5A40] hover:bg-[#3A3A2F] text-white px-4 py-3 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>}
                        加入收藏庫
                      </button>
                    )}
                    {result.isDuplicate && (
                      <button 
                         onClick={handleSave}
                         disabled={isSaving}
                         className="flex-1 bg-white hover:bg-[#F5F5F0] text-[#D9480F] border border-[#D9480F]/30 px-4 py-3 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                       >
                         {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <AlertTriangle className="w-5 h-5"/>}
                         依然強制加入
                       </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {souvenirs.length === 0 ? (
               <div className="text-center py-20">
                 <div className="w-24 h-24 bg-[#E8E8E0] rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
                   <Archive className="w-10 h-10 text-[#8A8A75]" />
                 </div>
                 <h2 className="text-2xl font-serif font-bold text-[#3A3A2F] mb-3">資料庫尚無記錄</h2>
                 <p className="text-[#8A8A75] text-sm max-w-xs mx-auto mb-6 leading-relaxed">趕快點擊下方「辨識」按鈕，從相機拍攝或相簿匯入你的專屬紀念品吧！</p>
               </div>
            ) : (
              <>
                <div className="mb-8 p-4 bg-[#FFF4E5] border border-[#FFD8A8] rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-[#D9480F] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#D9480F] leading-relaxed">
                    <span className="font-bold">提醒您：</span>目前資料儲存在您的瀏覽器中。為了避免清理快取時資料遺失，強烈建議您定期點擊右上角的 <Download className="w-3 h-3 inline" /> 進行備份。
                  </p>
                </div>
                {visibleCategories.map(category => {
                  const items = souvenirs.filter(s => 
                    s.category === category && 
                    (s.name.toLowerCase().includes(searchLower) || s.features.toLowerCase().includes(searchLower))
                  );

                  if (items.length === 0) return null;

                  return (
                    <div key={category} className="space-y-5 mb-8">
                      {selectedCategory === '全部' && (
                        <h2 className="text-xl font-serif font-semibold text-[#3A3A2F] flex items-center gap-3 border-b border-[rgba(90,90,64,0.1)] pb-3">
                          <span className="w-2 h-2 bg-[#5A5A40] rounded-full inline-block"></span>
                          {category}
                          <span className="text-[10px] bg-[#E8E8E0] text-[#5A5A40] px-2 py-0.5 rounded shadow-sm font-mono tracking-widest ml-1">
                            {items.length} 項目
                          </span>
                        </h2>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                        {items.map(item => (
                          <div 
                            key={item.id} 
                            onClick={() => {
                              setEditingItem(item);
                              setIsConfirmingDeleteItem(false);
                            }}
                            className="bg-white rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(90,90,64,0.05)] border border-[#E8E8E0] hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col group"
                          >
                            {item.imageUrl ? (
                               <div className="aspect-square bg-[#F5F5F0] relative border-b border-[#E8E8E0]">
                                 <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                 <div className="absolute inset-0 bg-[#3A3A2F]/0 group-hover:bg-[#3A3A2F]/5 transition-colors"></div>
                               </div>
                            ) : (
                              <div className="aspect-square bg-[#F9F9F7] flex items-center justify-center border-b border-[#E8E8E0]">
                                <Archive className="w-8 h-8 text-[#D9D9C3]" />
                              </div>
                            )}
                            <div className="p-4 flex-1 flex flex-col">
                              <h3 className="font-semibold text-[#3A3A2F] text-sm line-clamp-1">{item.name}</h3>
                              <p className="text-[11px] text-[#8A8A75] line-clamp-2 mt-1.5 leading-relaxed">{item.features}</p>
                              <div className="mt-auto pt-3 flex justify-between items-center">
                                <p className="text-[9px] font-mono text-[#D9D9C3] uppercase">{item.id.slice(-6)}</p>
                                <span className="text-[10px] text-[#8A8A75] bg-[#E8E8E0] px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">編輯</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </motion.div>
        )}
      </main>

      {/* Edit Item Modal */}
      <AnimatePresence>
        {editingItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3A3A2F]/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="relative bg-[#F5F5F0] shrink-0">
                {editingItem.imageUrl ? (
                  <img src={editingItem.imageUrl} alt={editingItem.name} className="w-full h-48 sm:h-56 object-cover border-b border-[#E8E8E0]" />
                ) : (
                  <div className="w-full h-48 sm:h-56 flex items-center justify-center border-b border-[#E8E8E0]">
                    <Archive className="w-12 h-12 text-[#D9D9C3]" />
                  </div>
                )}
                <button 
                  onClick={() => setEditingItem(null)}
                  className="absolute top-4 right-4 bg-white/80 backdrop-blur p-2 rounded-full text-[#3A3A2F] shadow-sm hover:bg-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5">
                <div>
                  <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">名稱</label>
                  <input 
                    type="text" 
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">分類</label>
                  <input 
                    type="text" 
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">特徵</label>
                  <textarea 
                    value={editingItem.features}
                    onChange={(e) => setEditingItem({ ...editingItem, features: e.target.value })}
                    rows={4}
                    className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#5A5A40] italic leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">個人備註 (選填)</label>
                  <input 
                    type="text" 
                    value={editingItem.userNote || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, userNote: e.target.value })}
                    className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30"
                  />
                </div>
              </div>

              {isConfirmingDeleteItem ? (
                 <div className="p-5 bg-[#FFF4E5] border-t border-[#FFD8A8] flex flex-col gap-3 mt-auto shrink-0">
                    <p className="text-sm text-[#D9480F] font-semibold text-center mb-1">確定要永久刪除這個藏品嗎？</p>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => setIsConfirmingDeleteItem(false)}
                        className="flex-1 px-4 py-3 rounded-full text-[#5A5A40] bg-white border border-[#D9D9C3] hover:bg-[#F5F5F0] transition-colors text-sm font-semibold"
                      >
                        取消
                      </button>
                      <button 
                        onClick={() => handleDeleteItem(editingItem.id)}
                        className="flex-1 px-4 py-3 rounded-full text-white bg-[#D9480F] hover:bg-[#C23B0B] transition-colors text-sm font-semibold shadow-sm"
                      >
                        確定刪除
                      </button>
                    </div>
                 </div>
              ) : (
                <div className="p-5 bg-[#F9F9F7] border-t border-[#E8E8E0] flex gap-3 mt-auto shrink-0">
                  <button 
                    onClick={() => setIsConfirmingDeleteItem(true)}
                    className="px-4 py-3 rounded-full text-[#D9480F] bg-white border border-[#FFD8A8] hover:bg-[#FFF4E5] transition-colors flex items-center justify-center shrink-0"
                    title="刪除"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={handleUpdateItem}
                    className="flex-1 px-4 py-3 rounded-full text-white bg-[#5A5A40] hover:bg-[#3A3A2F] transition-colors text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    儲存修改
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Edit Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3A3A2F]/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm p-6 space-y-6 relative"
            >
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="absolute top-4 right-4 text-[#8A8A75] hover:text-[#3A3A2F] transition-colors bg-white/50 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="font-serif font-bold text-xl text-[#3A3A2F] pr-8">管理收藏庫</h3>
              
              <div>
                <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">修改收藏庫名稱</label>
                <input 
                  type="text" 
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  className="w-full bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] font-semibold focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30"
                />
              </div>

              {isConfirmingDeleteCategory ? (
                 <div className="bg-[#FFF4E5] border border-[#FFD8A8] rounded-xl p-4 text-[#D9480F]">
                   <p className="text-sm font-bold mb-2 flex items-center gap-1">
                     <AlertTriangle className="w-4 h-4" />
                     確定要永久刪除此收藏庫嗎？
                   </p>
                   <p className="text-[11px] leading-relaxed opacity-90 mb-4">
                     這將會刪除該庫中的 <span className="font-bold underline">{souvenirs.filter(s => s.category === selectedCategory).length}</span> 個藏品，且無法復原。
                   </p>
                   <div className="flex gap-2">
                      <button 
                        onClick={() => setIsConfirmingDeleteCategory(false)}
                        className="flex-1 px-3 py-2 rounded-full text-[#5A5A40] bg-white border border-[#D9D9C3] hover:bg-[#F5F5F0] transition-colors text-xs font-semibold"
                      >
                        取消
                      </button>
                      <button 
                        onClick={handleDeleteCategory}
                        className="flex-1 px-3 py-2 rounded-full text-white bg-[#D9480F] hover:bg-[#C23B0B] transition-colors text-xs font-semibold shadow-sm"
                      >
                        確定刪除
                      </button>
                    </div>
                 </div>
              ) : (
                <>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-500">
                    <p className="text-[10px] leading-relaxed opacity-90">
                      若刪除此收藏庫，庫內所有的藏品也將一併被永久刪除。
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                       onClick={() => setIsConfirmingDeleteCategory(true)}
                      className="px-4 py-3 rounded-full text-[#D9480F] bg-white border border-[#FFD8A8] hover:bg-[#FFF4E5] transition-colors flex items-center justify-center shrink-0"
                      title="刪除收藏庫"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={handleRenameCategory}
                      disabled={!editingCategoryName.trim() || editingCategoryName.trim() === selectedCategory}
                      className="flex-1 bg-[#5A5A40] text-white px-4 py-3 rounded-full text-sm font-semibold hover:bg-[#3A3A2F] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      儲存變更
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}

        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center px-4"
            onClick={() => setIsSettingsOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[32px] w-full max-w-sm p-8 shadow-2xl space-y-6 relative border border-[#E8E8E0]"
            >
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-6 right-6 p-2 text-[#8A8A75] hover:bg-[#F5F5F0] rounded-full transition-colors"
                title="關閉"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="font-serif font-bold text-xl text-[#3A3A2F]">進階金鑰設定</h3>
              
              <div className="space-y-4">
                <div className="p-3 bg-[#F5F5F0] border border-[#D9D9C3] rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${apiKeyStatus === 'missing' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    <span className="text-[11px] font-bold text-[#5A5A40]">
                      目前的連線狀態：{apiKeyStatus === 'system' ? 'AI Studio Cloud (已連接)' : apiKeyStatus === 'custom' ? '使用者金鑰 (已連接)' : '尚未輸入金鑰'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8A8A75] leading-relaxed">
                    在 GitHub Pages 模式下，辨識功能需要您輸入個人的 API Key。此金鑰僅會儲存在這台裝置的瀏覽器中，安全合法。
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-[#8A8A75] mb-2 uppercase tracking-tight">您的 Gemini API Key</label>
                  <input 
                    type="password" 
                    placeholder="請貼上 AIza... 開頭的金鑰"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    className="w-full bg-white border border-[#D9D9C3] rounded-xl px-4 py-3 text-sm text-[#3A3A2F] font-mono focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/30"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => {
                    if (customApiKey.trim()) {
                      localStorage.setItem('GEMINI_CUSTOM_API_KEY', customApiKey.trim());
                      setIsSettingsOpen(false);
                      // Force a quick refresh of the status
                      setApiKeyStatus('custom');
                    } else {
                      localStorage.removeItem('GEMINI_CUSTOM_API_KEY');
                      setIsSettingsOpen(false);
                      setApiKeyStatus('missing');
                    }
                  }}
                  className="w-full bg-[#5A5A40] text-white px-4 py-3 rounded-full text-sm font-semibold hover:bg-[#3A3A2F] transition-colors shadow-sm"
                >
                  儲存設定
                </button>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full bg-white text-[#8A8A75] px-4 py-3 rounded-full text-sm font-semibold hover:bg-[#F5F5F0] transition-colors"
                >
                  取消
                </button>
              </div>
              
              <div className="pt-4 border-t border-[#E8E8E0]">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#5A5A40] underline hover:text-[#3A3A2F] block text-center"
                >
                  如何申請免費的 Gemini API Key？
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-transparent px-6 py-4 flex justify-center items-center z-20 pb-safe pointer-events-none">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center relative group pointer-events-auto"
        >
           <div className="bg-[#5A5A40] text-white w-14 h-14 rounded-[20px] flex items-center justify-center shadow-xl border-[4px] border-[#F5F5F0] group-hover:bg-[#3A3A2F] group-active:scale-95 transition-all duration-200">
             <Camera className="w-6 h-6" />
           </div>
        </button>
      </div>
    </div>
  );
}

export default App;
