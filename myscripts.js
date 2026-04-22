//<![CDATA[
(function(){
    // قائمة النطاقات المسموح بها 
    var allowedDomains =["elaraby-products.blogspot.com", "localhost"]; 
    var isAllowed = false;
    var currentDomain = window.location.hostname;
  
    for(var i=0; i<allowedDomains.length; i++){
      if(currentDomain.includes(allowedDomains[i])){
        isAllowed = true;
        break;
      }
    }
  
    if(!isAllowed){
      // العقوبة: مسح محتوى الصفحة بالكامل وتوجيه المستخدم لموقعك الأصلي
      document.documentElement.innerHTML = "<h1>⚠️ تم اكتشاف نسخة مسروقة! جاري التوجيه...</h1>";
      setTimeout(function(){
        window.location.href = "https://elaraby-products.blogspot.com";
      }, 2000);
      
      // إيقاف تنفيذ باقي الكود فوراً
      throw new Error("Security Violation: Unauthorized Domain");
    }
  })();

// إعدادات الكاش والتهيئة
const CACHE_KEY = 'elaraby_products_cache_v3'; 
const CACHE_TIME_KEY = 'elaraby_cache_time';
const RECENT_SEARCH_KEY = "elaraby_recent_searches";
// متغيرات النظام
let products = [];
let currentGal =[];
let currentIdx = 0;
let scale = 1;
let startX = 0, startY = 0, lastTap = 0;
let currentEffect = 'slideInUp';
let currentSpeed = '0.5';
let deferredPrompt; // PWA Variable
window.officialDevName = "Abd elmoneim";

// 2. إعداد Firebase
const firebaseConfig = { apiKey: "AIzaSyAsjxa0sr72e2PaEMOU9aVapNaCKcD6hUE", projectId: "elaraby-products" };
try { firebase.initializeApp(firebaseConfig); } catch(e) { console.log("Firebase loaded already"); }
const db = firebase.firestore();

// 3. دالة تنظيف النصوص 
function escapeStr(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
    return str.replace(/[&<>"']/ig, (match) => (map[match]));
}

// دالة تحويل السعر
function formatPriceForDisplay(price) {
    if (!price || price === "") return '';
    let cleanPrice = String(price).replace(/[^\d.]/g, '');
    let num = parseFloat(cleanPrice);
    if (isNaN(num)) return price;
    let formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
    return formatted + ' ج.م';
}

// دالة الحماية المنيعة
function safeParseJSON(key, defaultValue =[], storageType = localStorage) {
    try {
        const item = storageType.getItem(key);
        if (!item) return defaultValue;
        return JSON.parse(item);
    } catch (error) {
        console.error(`⚠️ تم اكتشاف بيانات تالفة في (${key}). تم إعادة ضبطها لحماية التطبيق.`);
        storageType.setItem(key, JSON.stringify(defaultValue));
        return defaultValue;
    }
}

// تفعيل التخزين المحلي لقاعدة البيانات
db.enablePersistence().catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code == 'unimplemented') {
        console.log('The current browser does not support all of the features required.');
    }
});

// متغيرات المساعد الذكي
window.aiConfig = {
    active: true,
    apiKey: "",
    promptConvince: "",
    promptCompare: ""
};

// الاستماع لحالة التفعيل ومفتاح الـ API
db.collection("app_config").doc("ai_settings").onSnapshot(doc => {
    if(doc.exists) {
        const data = doc.data();
        window.aiConfig.active = data.active !== false;
        window.aiConfig.apiKey = data.apiKey || "";
        window.aiConfig.promptConvince = data.promptConvince || "";
        window.aiConfig.promptCompare = data.promptCompare || "";
        document.documentElement.style.setProperty('--ai-display', window.aiConfig.active ? 'flex' : 'none');
    }
});

const CURRENT_SELLER_ID = localStorage.getItem('seller_doc_id');
const CURRENT_SELLER_NAME = localStorage.getItem('seller_name');

// استقبال الإعدادات من لوحة التحكم
db.collection("app_config").doc("ultimate_v5").onSnapshot((doc) => {
    if (doc.exists) {
        const s = doc.data();
        if (s.devPhone) {
            let devBtn = document.getElementById('dev-whatsapp-btn');
            if(!devBtn) {
                const footer = document.querySelector('.app-footer');
                if(footer) footer.insertAdjacentHTML('beforeend', `<a id="dev-whatsapp-btn" target="_blank" class="dev-contact-btn" style="display:none;"><i class="fa-brands fa-whatsapp"></i> تواصل مع المطور</a>`);
                devBtn = document.getElementById('dev-whatsapp-btn');
            }
            if(devBtn) {
                const cleanPhone = String(s.devPhone).replace(/\s+/g, '').replace('+', '');
                devBtn.href = "https://wa.me/" + cleanPhone;
                devBtn.removeAttribute('style'); 
                devBtn.style.display = "inline-flex"; 
            }
        }
        if(s.fontType) document.body.style.fontFamily = s.fontType;
        if(s.searchPlaceholder) { const el = document.getElementById('main-search'); if(el) el.placeholder = s.searchPlaceholder; }
        if(s.devName) { const el = document.querySelector('.dev-name'); if(el) el.textContent = s.devName; window.officialDevName = s.devName; }
        if(s.searchBtnBg) document.documentElement.style.setProperty('--main', s.searchBtnBg);
        if(s.titleColor) document.documentElement.style.setProperty('--title-color', s.titleColor);
        
        const logo = document.getElementById('main-logo');
        if(logo) {
            if(s.logoUrl) logo.src = s.logoUrl;
            logo.style.animation = (s.logoEffect === 'pulse') ? 'logoPulse 2s infinite' : (s.logoEffect === 'float') ? 'logoFloat 3s infinite' : 'none';
        }
        currentEffect = s.cardEffect || 'slideInUp';
        currentSpeed = s.animSpeed || '0.5';
    }
});

// دالة جلب البيانات
async function loadProducts() {
    console.log("⚡ جاري استعادة المنتجات من الذاكرة المحلية...");
    try {
        const cachedData = await localforage.getItem(CACHE_KEY);
        const localUpdateTime = await localforage.getItem(CACHE_TIME_KEY) || 0;

        if (cachedData && cachedData.length > 0) {
            products = Object.freeze(cachedData.map(Object.freeze));
            renderCategories();
            console.log("✅ تم عرض المنتجات من الكاش");
        }

        const metaDoc = await db.collection("app_config").doc("metadata").get();
        const serverUpdateTime = metaDoc.exists ? metaDoc.data().last_update_time : 0;

        if (serverUpdateTime > localUpdateTime || !cachedData) {
            console.log("🔄 يوجد تحديث جديد.. جاري التحميل من السيرفر");
            const snapshot = await db.collection("products").get();
            const rawProducts = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            await localforage.setItem(CACHE_KEY, rawProducts);
            await localforage.setItem(CACHE_TIME_KEY, serverUpdateTime);
            
            products = Object.freeze(rawProducts.map(Object.freeze));
            renderCategories();
        }
    } catch (error) {
        console.warn("⚠️ فشل الاتصال بالسيرفر، التطبيق يعمل في وضع الأوفلاين");
    }
}
      
// دالة رسم الأقسام الذكية
function renderCategories() {
    const menu = document.getElementById('cat-drop-menu');
    if(!menu) return;
    
    if(!products || products.length === 0) {
        menu.innerHTML = '<div style="padding:15px; text-align:center; color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';
        return;
    }

    const categoryIcons = {
        "تكييف": "fa-snowflake", "ثلاجات": "fa-temperature-low", "غسالة": "fa-jug-detergent",
        "شاش": "fa-tv", "بوتاجاز": "fa-fire-burner", "سخان": "fa-fire-flame-simple",
        "مروحة": "fa-fan", "ديب فريزر": "fa-icicles", "مبرد": "fa-glass-water",
        "خلاط": "fa-blender", "مكوا": "fa-shirt", "دفاية": "fa-fire"
    };

    const getIcon = (catName) => {
        for (let key in categoryIcons) { if (catName.includes(key)) return categoryIcons[key]; }
        return "fa-box-open"; 
    };

    const refayeMap = {
        "دفايات":["زيت", "هالوجين", "سيراميك", "كوارتز", "تورنيدو"],
        "مراوح":["سقف", "استاند", "حائط", "مكتب", "بوكس", "360"],
        "مكنسة":["توشيبا", "هوفر", "هيتاشي", "تورنيدو"],
        "خلاط": ["تورنيدو"],
        "محضر":[ "محضرة", "مفرمة", "كبة", "عجان", "مضرب" ,"محضرة قهوة تركي" ,"ماكينة إسبريسو" ,"محضرة قهوة أمريكان"],
        "مكواه": ["استاند" ,"بخار"],
        "شفاط":["توشيبا", "تورنيدو", "مطبخ", "حمام", "مسطح", "هرمي"],
        "اير فراير": ["تورنيدو", "شارب"],
        "هاند بلندر": ["تورنيدو", "شارب"]
    };

    const refayeKeys = Object.keys(refayeMap); 
    const uniqueCats =[...new Set(products.map(p => p.category).filter(c => c && c.trim() !== ''))];
    
    let normalCatsHtml = "";
    let refayeCategories = new Set();
    let hasWashingMachines = false;
    let hasWaterHeaters = false;

    uniqueCats.forEach((cat) => {
        const isRefaye = refayeKeys.some(r => cat.includes(r));
        const isWashingMachine = cat.includes("غسالة") || cat.includes("غسالات");
        const isWaterHeater = cat.includes("سخان");

        if (isWashingMachine) {
            hasWashingMachines = true;
        } else if (isWaterHeater) {
            hasWaterHeaters = true; 
        } else if (isRefaye) {
            refayeCategories.add(cat);
        } else {
            const iconClass = getIcon(cat);
            const menuId = `sub-menu-normal-${cat.replace(/\s+/g, '-')}`;
            const generalBrands =["شارب", "توشيبا", "تورنيدو", "هوفر", "سوني", "لاجيرمانيا", "كاندي", "هيتاشي", "tcl", "تي سي إل" ,"هيلر"];
            const keywordsInCat = new Set();
            
            products.filter(p => p.category === cat).forEach(p => {
                generalBrands.forEach(k => { if (p.name && p.name.includes(k)) keywordsInCat.add(k); });
            });
            const subCats = Array.from(keywordsInCat);

            normalCatsHtml += buildMenuRow(cat, iconClass, menuId, subCats, 'cat', 'sub');
        }
    });

    let washingHtml = "";
    if (hasWashingMachines) {
        washingHtml = buildMenuRow("الغسالات (ملابس وأطباق)", "fa-jug-detergent", "menu-washing-main",[
            { text: "تحميل علوي", val: "فوق", icon: "fa-arrow-up" },
            { text: "تحميل أمامي", val: "فول", icon: "fa-arrow-right" },
            { text: "نصف اوتوماتيك", val: "هاف", icon: "fa-arrow-right" },           
            { text: "غسالات أطباق", val: "اطباق", icon: "fa-sink" }
        ], 'washing_all', 'washing', true);
    }

    let heatersHtml = "";
    if (hasWaterHeaters) {
        heatersHtml = buildMenuRow("سخانات المياه", "fa-fire-flame-simple", "menu-heaters-main",[
            { text: "سخان غاز", val: "غاز", icon: "fa-fire" },
            { text: "سخان كهرباء", val: "كهرباء", icon: "fa-bolt" }
        ], 'heaters_all', 'heaters', true);
    }

    let refayeHtml = "";
    if (refayeCategories.size > 0) {
        let refayeItemsHtml = "";
        Array.from(refayeCategories).forEach(refCat => {
            const menuId = `sub-refaye-${refCat.replace(/\s+/g, '-')}`;
            const availableBrands = new Set();
            let specificKeywords =[];
            for (let key in refayeMap) {
                if (refCat.includes(key)) {
                    specificKeywords = [...new Set([...specificKeywords, ...refayeMap[key]])];
                }
            }
            if(specificKeywords.length === 0) specificKeywords =["توشيبا", "تورنيدو", "هوفر"];

            products.filter(p => p.category === refCat).forEach(p => {
                specificKeywords.forEach(k => { 
                    if (p.name && p.name.includes(k)) availableBrands.add(k); 
                });
            });
            refayeItemsHtml += buildMenuRow(refCat, getIcon(refCat), menuId, Array.from(availableBrands), 'cat', 'refaye_sub', false, refCat);
        });

        refayeHtml = `
            <div>
                <div class="cat-main-row">
                    <div class="cat-main-text" onclick="filterBySmart('refaye_all', '', this)">
                        <i class="fa-solid fa-kitchen-set"></i> الرفايع والأجهزة الصغيرة
                    </div>
                    <div class="cat-toggle-arrow" onclick="toggleSmartSubMenu(event, 'menu-refaye-main', this)"><i class="fa-solid fa-chevron-down"></i></div>
                </div>
                <div id="menu-refaye-main" class="sub-menu-container"><div class="sub-menu-inner">
                    ${refayeItemsHtml}
                </div></div>
            </div>
        `;
    }

    menu.innerHTML = washingHtml + heatersHtml + normalCatsHtml + refayeHtml;
}

function buildMenuRow(title, icon, menuId, subItems, mainAction, subAction, isCustomObjects = false, parentCat = null) {
    let subHtml = "";
    if (subItems.length > 0) {
        subHtml = `<div id="${menuId}" class="sub-menu-container"><div class="sub-menu-inner">`;
        subItems.forEach(item => {
            let text, val, subIcon;
            if (isCustomObjects) {
                text = item.text; val = item.val; subIcon = item.icon;
            } else {
                text = item; val = parentCat ? `${parentCat}|${item}` : `${title}|${item}`; subIcon = "fa-tag";
            }
            subHtml += `<div class="cat-drop-item" onclick="filterBySmart('${subAction}', '${val}', this)">
                            <i class="fa-solid ${subIcon}"></i> ${text}
                        </div>`;
        });
        subHtml += `</div></div>`;
    }
    return `
        <div class="cat-main-row">
            <div class="cat-main-text" onclick="filterBySmart('${mainAction}', '${title}', this)">
                <i class="fa-solid ${icon}"></i> ${title}
            </div>
            ${subItems.length > 0 ? `<div class="cat-toggle-arrow" onclick="toggleSmartSubMenu(event, '${menuId}', this)"><i class="fa-solid fa-chevron-down"></i></div>` : ''}
        </div>
        ${subHtml}
    `;
}

window.toggleSmartSubMenu = function(event, menuId, arrowEl) {
    event.stopPropagation();
    const targetMenu = document.getElementById(menuId);
    if (!targetMenu) return;

    const isCurrentlyOpen = targetMenu.classList.contains('open');
    const allOpenMenus = document.querySelectorAll('.sub-menu-container.open');
    
    allOpenMenus.forEach(menu => {
        if (menu !== targetMenu && !menu.contains(targetMenu)) {
            menu.classList.remove('open');
            if (menu.previousElementSibling) {
                const relatedArrow = menu.previousElementSibling.querySelector('.cat-toggle-arrow');
                if (relatedArrow) relatedArrow.classList.remove('open-arrow');
            }
        }
    });

    if (!isCurrentlyOpen) {
        targetMenu.classList.add('open');
        arrowEl.classList.add('open-arrow');
    } else {
        targetMenu.classList.remove('open');
        arrowEl.classList.remove('open-arrow');
    }
};

window.filterBySmart = function(filterType, filterValue, el) {
    document.querySelectorAll('.cat-main-row, .cat-drop-item').forEach(item => item.classList.remove('active'));
    if(el.classList.contains('cat-main-text')) el.parentElement.classList.add('active');
    else el.classList.add('active');
    
    const menu = document.getElementById("cat-drop-menu");
    const mainArrow = document.getElementById("cat-main-arrow");
    if(menu) menu.classList.remove("show-menu");
    if(mainArrow) { mainArrow.style.transform = "rotate(0deg)"; mainArrow.style.color = "#1e293b"; }
    
    const btnText = document.querySelector('#cat-toggle-btn span');
    const res = document.getElementById('results-container');
    const tourBtn = document.getElementById('home-tour-btn'); 
    
    if(tourBtn) tourBtn.classList.add('tour-hidden');
    res.innerHTML = '<div style="text-align:center; width:100%; padding:60px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--main)"></i><br><br><b style="color:#777;">جاري ترتيب المنتجات...</b></div>';

    setTimeout(() => {
        let filtered =[];
        const refayeList =["مكنسة", "خلاط", "محضر", "مكواه", "مكواة", "شفاط", "اير فراير", "قلاية", "مفرمة", "كبة", "عجان", "مضرب", "هاند بلندر", "مروحة", "مراوح", "دفاية"];

        if (filterType === 'refaye_all') {
            if(btnText) btnText.innerHTML = '<i class="fa-solid fa-kitchen-set"></i> كل الرفايع';
            filtered = products.filter(p => refayeList.some(r => p.category && p.category.includes(r)));
        } 
        else if (filterType === 'cat') {
            if(btnText) btnText.innerHTML = `<i class="fa-solid fa-folder-open"></i> ${filterValue}`;
            filtered = products.filter(p => p.category === filterValue);
        } 
        else if (filterType === 'sub' || filterType === 'refaye_sub') {
            const [cat, keyword] = filterValue.split('|');
            if(btnText) btnText.innerHTML = `<i class="fa-solid fa-tag"></i> ${cat} ⟵ ${keyword}`;
            filtered = products.filter(p => p.category === cat && p.name && p.name.includes(keyword));
        }
        else if (filterType === 'washing_all') {
            if(btnText) btnText.innerHTML = `<i class="fa-solid fa-jug-detergent"></i> كل الغسالات`;
            filtered = products.filter(p => p.category && (p.category.includes('غسالة') || p.category.includes('غسالات')));
        }
        else if (filterType === 'washing') {
            const keyword = filterValue;
            let displayKeyword = keyword === 'فوق' ? 'تحميل علوي' : (keyword === 'فول' ? 'تحميل أمامي' : 'غسالات أطباق');
            if(btnText) btnText.innerHTML = `<i class="fa-solid fa-jug-detergent"></i> غسالات ⟵ ${displayKeyword}`;

            filtered = products.filter(p => {
                const c = p.category ? p.category.toLowerCase() : "";
                const n = p.name ? p.name.toLowerCase() : "";
                if (!(c.includes('غسالة') || c.includes('غسالات'))) return false;

                if (keyword === 'فوق') return n.includes('فوق') || n.includes('علوي') || n.includes('هاف');
                if (keyword === 'فول') return n.includes('فول') || n.includes('امامي');
                if (keyword === 'اطباق') return c.includes('اطباق') || n.includes('اطباق');
                return false;
            });
        }
        else if (filterType === 'heaters_all') {
            if(btnText) btnText.innerHTML = `<i class="fa-solid fa-fire-flame-simple"></i> كل السخانات`;
            filtered = products.filter(p => p.category && p.category.includes('سخان'));
        }
        else if (filterType === 'heaters') {
            const keyword = filterValue;
            if(btnText) btnText.innerHTML = `<i class="fa-solid fa-fire-flame-simple"></i> سخانات ⟵ ${keyword}`;

            filtered = products.filter(p => {
                const c = p.category ? p.category.toLowerCase() : "";
                const n = p.name ? p.name.toLowerCase() : "";
                if (!c.includes('سخان')) return false;

                if (keyword === 'غاز') return n.includes('غاز');
                if (keyword === 'كهرباء') return n.includes('كهرباء');
                return false;
            });
        }

        if(typeof displayResults === 'function') displayResults(filtered);
    }, 150);
};

window.toggleCatDropdown = function(event) {
    if(event) event.stopPropagation();
    const menu = document.getElementById("cat-drop-menu");
    const arrow = document.getElementById("cat-main-arrow");
    
    if(menu) {
        menu.classList.toggle("show-menu");
        if(arrow) {
            if(menu.classList.contains("show-menu")) {
                arrow.style.transform = "rotate(180deg)";
                arrow.style.transition = "transform 0.3s ease";
                arrow.style.color = "var(--main)";
            } else {
                arrow.style.transform = "rotate(0deg)";
                arrow.style.color = "#1e293b";
            }
        }
    }
};

document.addEventListener('click', function(event) {
    const dropdownContainer = document.querySelector('.categories-dropdown');
    const menu = document.getElementById("cat-drop-menu");
    const arrow = document.getElementById("cat-main-arrow");

    if (dropdownContainer && !dropdownContainer.contains(event.target)) {
        if (menu && menu.classList.contains('show-menu')) {
            menu.classList.remove('show-menu');
            if(arrow) {
                arrow.style.transform = "rotate(0deg)";
                arrow.style.color = "#1e293b";
            }
        }
    }
});

const inp = document.getElementById('main-search');
const box = document.getElementById('sug-box');

function debounce(func, wait) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => func.apply(this, args), wait);
    };
}

inp.oninput = debounce(function() {
    const v = this.value.trim().toLowerCase();
    box.innerHTML = '';
    if(!v) { box.style.display = 'none'; return; }
    const m = products.filter(p => (p.name && p.name.toLowerCase().includes(v)) || (p.id && p.id.toLowerCase().includes(v))).slice(0,5);
    if(m.length) {
        box.style.display = 'block';
        m.forEach(p => {
            const d = document.createElement('div');
            d.className = 'sug-item';
            d.textContent = p.name;
            d.onclick = () => { inp.value = p.id; box.style.display = 'none'; doSearch(); };
            box.appendChild(d);
        });
    }
}, 250);
      
inp.onkeypress = (e) => { if(e.key === 'Enter') { box.style.display = 'none'; doSearch(); inp.blur(); } };

function doSearch() {
    const box = document.getElementById('sug-box');
    const tourBtn = document.getElementById('home-tour-btn'); 
    if(box) box.style.display = 'none';

    const q = inp.value.trim().toLowerCase();
    if(!q) return;

    if(tourBtn) tourBtn.classList.add('tour-hidden');

    const res = document.getElementById('results-container');
    res.innerHTML = '<div style="text-align:center; width:100%; padding:40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--main)"></i></div>';
            
    const matches = products.filter(p => 
        (p.id && p.id.toLowerCase().includes(q)) || 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );

    displayResults(matches);

    let recent = safeParseJSON(RECENT_SEARCH_KEY,[]);
    recent.unshift(q);
    recent =[...new Set(recent)].slice(0,5);
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(recent));
    if(typeof loadRecentSearches === 'function') loadRecentSearches();

    inp.value = '';  
    inp.blur();      
}

window.currentFilteredProducts =[];
window.currentDisplayCount = 0;
const PRODUCTS_PER_PAGE = 10;

function displayResults(matches, append = false) {
    const res = document.getElementById('results-container');
    const loadMoreBtn = document.getElementById('load-more-wrapper');
    
    if (!append) {
        res.innerHTML = '';
        window.currentFilteredProducts = matches;
        window.currentDisplayCount = 0;
    }
    
    if (window.currentFilteredProducts.length === 0) {
        res.innerHTML = `
            <div class="no-results-found" style="text-align:center; padding:40px;">
            <img src="https://cdn-icons-png.flaticon.com/512/7486/7486740.png" style="width:90px; opacity:.7; margin-bottom:10px;">
            <h3>لا توجد نتائج مطابقة</h3>
            <p style="color:#777; font-size:14px;">جرب كتابة اسم المنتج أو كود مختلف أو تأكد من القسم</p>
            </div>`;
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        return;
    }

    const toShow = window.currentFilteredProducts.slice(
        window.currentDisplayCount, 
        window.currentDisplayCount + PRODUCTS_PER_PAGE
    );

    const fragment = document.createDocumentFragment();

    toShow.forEach((p, index) => {
        renderProductCard(p, fragment, window.currentDisplayCount + index);
    });
    
    res.appendChild(fragment);
    window.currentDisplayCount += toShow.length;

    if (window.currentDisplayCount < window.currentFilteredProducts.length) {
        if (loadMoreBtn) loadMoreBtn.style.display = 'block';
    } else {
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }

    if (!append) {
        setTimeout(() => {
            const headerOffset = 30; 
            const elementPosition = res.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            window.scrollTo({ top: offsetPosition, behavior: "smooth" });
        }, 100);
    }
}

window.loadMoreProducts = function() {
    const btn = document.querySelector('.btn-load-more');
    if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...';
    
    setTimeout(() => {
        displayResults(window.currentFilteredProducts, true);
        if(btn) btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> عرض المزيد';
    }, 400); 
};

function renderProductCard(p, container, index) {
    const safeName = escapeStr(p.name);
    const safeDetails = escapeStr(p.details);
    
    const images = p.images || [];
    const mainImg = images.length > 0 ? images[0] : 'https://placehold.co/400x400/f8f9fa/1a73e8?text=No+Image';
    const thumbHtml = images.map((img, i) => `<img class="thumb-item ${i===0?'active':''}" src="${img}" loading="lazy" onclick="updateDisplay('${p.id}', '${img}', ${i}, this)"/>`).join('');
    const videoBtn = p.video ? `<div class="thumb-item" style="background:red; color:#fff; display:flex; align-items:center; justify-content:center;" onclick="updateDisplayVideo('${p.id}', '${p.video}', this)">▶</div>` : '';

    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.animation = `${currentEffect} ${currentSpeed}s ease forwards`;
    card.style.animationDelay = `${index * 0.1}s`;

    let finalSpecsHtml = '';

    if (p.details) {
        const lines = p.details.split('\n');
        let currentHeading = 'أهم المواصفات';
        let currentPoints =[];

        const buildGroupHtml = (heading, points) => {
            if (points.length === 0) return '';
            const pointsHtml = points.map(pt => `
                <li><i class="fa-solid fa-check bullet-icon"></i> <span>${pt}</span></li>
            `).join('');
            return `
                <div class="spec-group-card">
                    <div class="spec-group-header">
                        <i class="fa-solid fa-layer-group"></i> ${heading}
                    </div>
                    <ul class="spec-points-list">
                        ${pointsHtml}
                    </ul>
                </div>
            `;
        };

        lines.forEach(line => {
            let cleanLine = line.replace(/<\/?(?:div|p|br|table|tr|td)[^>]*>/gi, '').trim().replace(/^[-*•>✓✔]\s*/, '');
            if (!/[a-zA-Z0-9\u0600-\u06FF]/.test(cleanLine)) return;

            let isHeading = false;
            if (cleanLine.endsWith(':') || cleanLine.endsWith('：')) {
                isHeading = true;
                cleanLine = cleanLine.replace(/[:：]$/, '').trim();
            } else if (cleanLine.startsWith('[') && cleanLine.endsWith(']')) {
                isHeading = true;
                cleanLine = cleanLine.slice(1, -1).trim();
            }

            if (isHeading) {
                if (currentPoints.length > 0) {
                    finalSpecsHtml += buildGroupHtml(currentHeading, currentPoints);
                    currentPoints =[];
                }
                currentHeading = cleanLine;
            } else {
                if (cleanLine.includes(':')) {
                    const parts = cleanLine.split(':');
                    const key = parts[0].trim();
                    const val = parts.slice(1).join(':').trim();
                    currentPoints.push(`<span class="spec-key">${key}:</span> ${val}`);
                } else if (cleanLine.includes(' - ')) {
                    const parts = cleanLine.split(' - ');
                    const key = parts[0].trim();
                    const val = parts.slice(1).join(' - ').trim();
                    currentPoints.push(`<span class="spec-key">${key} -</span> ${val}`);
                } else {
                    currentPoints.push(cleanLine);
                }
            }
        });

        if (currentPoints.length > 0) {
            finalSpecsHtml += buildGroupHtml(currentHeading, currentPoints);
        }
    }

    if (finalSpecsHtml === '') {
        finalSpecsHtml = `
            <div class="spec-group-card">
                <div class="spec-group-header"><i class="fa-solid fa-circle-info"></i> ملاحظة</div>
                <ul class="spec-points-list">
                    <li style="justify-content:center; color:#888;">لا توجد مواصفات متاحة</li>
                </ul>
            </div>`;
    }

    card.innerHTML = `
        <div class="main-display skeleton" id="display-${p.id}">
            <img src="${mainImg}" loading="lazy" style="opacity:0; transition:.4s;" onload="this.style.opacity=1; 
            this.parentElement.classList.remove('skeleton')" onclick="openViewerFromSrc('${p.id}', this.src)"/>
        </div>
        <div id="thumbs-${p.id}" class="thumb-slider">${thumbHtml}${videoBtn}</div>
        <h3 style="text-align:center; margin:10px 0;">${p.name || 'بدون اسم'}</h3>
        <div class="modern-color-wrapper" id="color-wrap-${p.id}">
            ${(p.colors ||[]).map((c, i) => `
                <div class="modern-swatch ${i === 0 ? 'active' : ''}" 
                     style="background-color: ${c.code};" 
                     data-tooltip="${c.name}" 
                     onclick="handleModernColorClick('${p.id}', '${c.image}', this)">
                </div>
            `).join('')}
        </div>
        <div class="details-section" id="det-${p.id}">
            <div class="pro-details-container" style="padding:15px 10px;">
                ${finalSpecsHtml}
            </div>
        </div>
        <div style="text-align:center; color:var(--main); font-size:1.5rem; font-weight:bold; margin-bottom:10px;">${formatPriceForDisplay(p.price)}</div>
        <div class="card-footer-actions">
            <button style="grid-column: span 2; background: linear-gradient(135deg, #1a9ae8, #0b5099); color: #fff !important; border: none; padding: 10px 12px; border-radius: 35px; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 115, 185, 0.4); font-family: 'Cairo', sans-serif;" onclick="toggleD('${p.id}', this)">المواصفات الفنية</button>
            <button class="wa-btn" onclick="sendWhatsApp('${p.id}')" style="padding:10px; background:linear-gradient(135deg, #25D366, #128C7E); color:#fff; border:none; cursor:pointer; border-radius:35px; box-shadow: 0 4px 10px rgba(37, 211, 102, 0.3); display: flex; align-items: center; justify-content: center; gap: 5px; transition: transform 0.2s; font-family: 'Cairo', sans-serif;">
                <i class="fab fa-whatsapp" style="font-size:16px;"></i> إرسال للعميل
            </button>
            <button style="padding:10px; background:#6f42c1; color:#fff; border:none; cursor:pointer; border-radius:35px; font-family: 'Cairo', sans-serif; font-size: 16px;" onclick="openCustomerModal('${safeName}')">👤 تسجيل عميل</button>
            <div class="ai-btn-group">
                <button style="padding:10px; background: linear-gradient(135deg, #FFD700, #F59E0B); color:#000; border:none; cursor:pointer; border-radius: 35px; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 5px; font-family: 'Cairo', sans-serif;" onclick="aiPersuadeCustomer('${p.id}')">✨ اقنع العميل</button>
                <button style="padding:10px; background: linear-gradient(135deg, #3B82F6, #2563EB); color:#fff; border:none; cursor:pointer; border-radius: 35px; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 5px; font-family: 'Cairo', sans-serif;" id="btn-compare-${p.id}" onclick="aiCompareMenu('${p.id}')">⚖️ قارن منتجين</button>
            </div>
        </div>`;
    container.appendChild(card); 
}

window.updateDisplay = function(pid, src, idx, thumb) {
    const display = document.getElementById(`display-${pid}`);
    if(display) {
        display.classList.add('skeleton');
        display.innerHTML = `<img src="${src}" style="opacity:0; transition:opacity 0.4s" onload="this.style.opacity='1'; this.parentElement.classList.remove('skeleton')" onclick="openViewerFromSrc('${pid}', this.src)"/>`;
    }
    if(thumb) {
        thumb.parentElement.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
    }
};

window.updateDisplayVideo = function(pid, vid, thumb) {
    let videoHtml = '';
    if (vid.includes('youtube.com') || vid.includes('youtu.be')) {
        let videoId = vid.includes('v=') ? vid.split('v=')[1].split('&')[0] : vid.split('/').pop();
        videoHtml = `<div class="video-container"><iframe src="https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1" allowfullscreen></iframe></div>`;
    } else {
        videoHtml = `<div class="video-container"><video src="${vid}" controls autoplay playsinline></video></div>`;
    }
    const display = document.getElementById(`display-${pid}`);
    if(display) display.innerHTML = videoHtml;
    if(thumb) {
        thumb.parentElement.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
    }
};

window.focusColor = function(pid, src) {
    window.updateDisplay(pid, src, null, null);
};

window.toggleD = function(id, btn) {
    const el = document.getElementById('det-' + id);
    if(el) {
        el.classList.toggle('open');
        btn.textContent = el.classList.contains('open') ? 'إخفاء' : 'المواصفات الفنية';
    }
};

// نظام العرض الاحترافي
let pv_current_images =[];
let pv_current_index = 0;
let pv_observer = null; 

function getYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function initProViewerDOM() {
    if (document.getElementById('pro-viewer')) return;
    const html = `
    <div id="pro-viewer" class="pro-viewer-overlay">
        <div class="pv-header">
            <button class="pv-close" onclick="closeProViewer()">&#10005;</button>
            <div class="pv-counter" id="pv-counter">1 / 1</div>
        </div>
        <div class="pv-track-container">
            <div class="pv-track" id="pv-track"></div>
        </div>
        <div class="pv-thumbnails" id="pv-thumbs"></div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

window.openViewerFromSrc = function(productId, initialSrc) {
    initProViewerDOM(); 
    const notifyBar = document.getElementById('sys-notification-bar');
    if(notifyBar) notifyBar.style.display = 'none';

    const product = products.find(p => p.id === productId);
    if (!product) return;

    pv_current_images =[...(product.images || [])];
    if (product.colors && product.colors.length > 0) {
        product.colors.forEach(c => {
            if (c.image && c.image.trim() !== "" && !pv_current_images.includes(c.image)) {
                pv_current_images.push(c.image);
            }
        });
    }

    if (product.video && product.video.trim() !== "") {
        pv_current_images.push({ type: 'video', src: product.video });
    }

    pv_current_index = pv_current_images.findIndex(item => (typeof item === 'string' && item === initialSrc));
    if (pv_current_index === -1) pv_current_index = 0;

    const track = document.getElementById('pv-track');
    const thumbs = document.getElementById('pv-thumbs');
    track.innerHTML = '';
    thumbs.innerHTML = '';

    pv_current_images.forEach((media, index) => {
        const slide = document.createElement('div');
        slide.className = 'pv-slide';
        slide.dataset.index = index;

        if (typeof media === 'string') {
            slide.innerHTML = `<img src="${media}" class="pv-media" ondblclick="togglePvZoom(this)" loading="lazy" draggable="false">`;
        } else if (media.type === 'video') {
            let videoHTML = '';
            const vidSrc = media.src;
            if (vidSrc.includes('youtube') || vidSrc.includes('youtu.be')) {
                const vId = getYouTubeID(vidSrc);
                videoHTML = vId 
                    ? `<iframe src="https://www.youtube.com/embed/${vId}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1" allowfullscreen></iframe>`
                    : `<div style="color:white">رابط فيديو غير صحيح</div>`;
            } else {
                videoHTML = `<video src="${vidSrc}" controls playsinline></video>`;
            }
            slide.innerHTML = `<div class="pv-video-wrapper">${videoHTML}</div>`;
        }
        track.appendChild(slide);

        const thumb = document.createElement('img');
        thumb.className = `pv-thumb ${index === pv_current_index ? 'active' : ''}`;
        if (typeof media === 'string') {
            thumb.src = media;
        } else {
            thumb.src = 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png'; 
            thumb.style.padding = '12px'; thumb.style.background='#fff';
        }
        thumb.onclick = () => pvScrollTo(index);
        thumbs.appendChild(thumb);
    });

    const viewer = document.getElementById('pro-viewer');
    viewer.classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        pvScrollTo(pv_current_index);
        setupIntersectionObserver();
    }, 50);

    history.pushState({ proViewer: true }, null, "#view");
};

window.togglePvZoom = function(img) {
    const slide = img.parentElement;
    const track = document.getElementById('pv-track');
    if (slide.classList.contains('zoomed-mode')) {
        slide.classList.remove('zoomed-mode');
        track.classList.remove('locked'); 
        slide.scrollTop = 0; slide.scrollLeft = 0;
    } else {
        track.classList.add('locked'); 
        slide.classList.add('zoomed-mode'); 
        setTimeout(() => {
            slide.scrollLeft = (img.width - slide.clientWidth) / 2;
            slide.scrollTop = (img.height - slide.clientHeight) / 2;
        }, 50);
    }
};

window.openInAppBrowser = function(url, title = 'عرض الصفحة') {
    const browserOverlay = document.getElementById('in-app-browser');
    const iframe = document.getElementById('in-app-iframe');
    const titleEl = document.getElementById('in-app-title');
    const extLink = document.getElementById('in-app-external-link');
    const loader = document.getElementById('in-app-loader');

    titleEl.innerText = title;
    extLink.href = url;
    loader.style.display = 'flex';
    iframe.style.opacity = '0';
    iframe.src = url;

    iframe.onload = function() {
        loader.style.display = 'none';
        iframe.style.opacity = '1';
    };

    browserOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeInAppBrowser = function() {
    const browserOverlay = document.getElementById('in-app-browser');
    const iframe = document.getElementById('in-app-iframe');
    browserOverlay.classList.remove('active');
    document.body.style.overflow = 'auto';
    setTimeout(() => { iframe.src = ''; }, 400); 
};

window.pvScrollTo = function(index) {
    const track = document.getElementById('pv-track');
    const slide = track.children[index];
    if(slide) {
        slide.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    }
};

function setupIntersectionObserver() {
    if (pv_observer) pv_observer.disconnect();
    const track = document.getElementById('pv-track');
    const slides = document.querySelectorAll('.pv-slide');

    pv_observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const idx = parseInt(entry.target.dataset.index);
                updateThumbsUI(idx);
            }
        });
    }, { root: track, threshold: 0.5 }); 

    slides.forEach(s => pv_observer.observe(s));
}

function updateThumbsUI(index) {
    pv_current_index = index;
    const counter = document.getElementById('pv-counter');
    if(counter) counter.textContent = `${index + 1} / ${pv_current_images.length}`;
    
    document.querySelectorAll('.pv-thumb').forEach((t, i) => {
        if (i === index) {
            t.classList.add('active');
            t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        } else {
            t.classList.remove('active');
        }
    });

    const track = document.getElementById('pv-track');
    Array.from(track.children).forEach((slide, i) => {
        if (i !== index) {
            const vid = slide.querySelector('video');
            if(vid) vid.pause();
            const iframe = slide.querySelector('iframe');
            if(iframe) iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
    });
}

window.closeProViewer = function() {
    const viewer = document.getElementById('pro-viewer');
    if (!viewer) return;

    viewer.classList.remove('active');
    document.body.style.overflow = 'auto';

    if (pv_observer) { pv_observer.disconnect(); pv_observer = null; }

    const track = document.getElementById('pv-track');
    track.querySelectorAll('iframe').forEach(ifr => ifr.src = ifr.src);
    track.querySelectorAll('video').forEach(vid => vid.pause());

    const notifyBar = document.getElementById('sys-notification-bar');
    if(notifyBar && notifyBar.classList.contains('active-notify')) notifyBar.style.display = 'flex';

    if(window.location.hash === "#view") history.back();
};

window.addEventListener('popstate', function(event) {
    const viewer = document.getElementById('pro-viewer');
    if (viewer && viewer.classList.contains('active')) {
        closeProViewer();
    }
});

db.collection("app_config").doc("ultimate_v5").get().then((doc) => {
    if (doc.exists) {
        const s = doc.data();
        if(s.fontType) document.body.style.fontFamily = s.fontType;
        if(s.searchBtnBg) document.documentElement.style.setProperty('--main', s.searchBtnBg);
        if(s.titleColor) document.documentElement.style.setProperty('--title-color', s.titleColor);
        const logo = document.getElementById('main-logo');
        if(logo) {
            if(s.logoUrl) logo.src = s.logoUrl;
            logo.style.animation = (s.logoEffect === 'pulse') ? 'logoPulse 2s infinite' : (s.logoEffect === 'float') ? 'logoFloat 3s infinite' : 'none';
        }
    }
});

db.collection("app_config").doc("maintenance_mode").onSnapshot(doc => {
    if(doc.exists) {
        const data = doc.data();
        const screen = document.getElementById('maintenance-screen');
        if (data.isActive) {
            if(screen) screen.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        } else {
            if(screen) screen.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }
});

db.collection("app_config").doc("notifications").onSnapshot(doc => {
    if(!doc.exists) return;
    const data = doc.data();
    const bar = document.getElementById('sys-notification-bar');
    const txt = document.getElementById('sys-notify-text');
    if (data.active && data.message && bar && txt) {
        txt.textContent = data.message;
        bar.className = `notify-${data.type || 'info'}`;
        bar.style.display = 'flex';
        setTimeout(() => bar.classList.add('active-notify'), 100);
    } else if (bar) {
        bar.classList.remove('active-notify');
    }
});

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

if (localStorage.getItem('theme') === 'dark') { 
    document.body.classList.add('dark-mode'); 
    document.getElementById('dark-mode-toggle').textContent = '☀️'; 
}

window.isSharingInProgress = false;

window.sendWhatsApp = async function(productId) {
    if (window.isSharingInProgress) return;
    window.isSharingInProgress = true;
    const releaseLock = () => { setTimeout(() => { window.isSharingInProgress = false; }, 800); };

    const p = products.find(prod => prod.id === productId);
    if (!p) { releaseLock(); return; }
    
    function cleanHTML(html) {
        if (!html) return "لا توجد تفاصيل إضافية.";
        return html.replace(/<br\s*[\/]?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<li>/gi, "- ").replace(/<\/li>/gi, "\n").replace(/<[^>]+>/g, "").trim().replace(/[\r\n]+/g, '\n');
    }

    let plainDetails = cleanHTML(p.details);
    const priceText = p.price ? `${Number(p.price).toLocaleString('en-US')} ج.م` : 'السعر عند التواصل';
    const textMessage = `أهلاً بك عميلنا العزيز 🌟\nبناءً على طلبك، إليك تفاصيل المنتج:\n\n📦 *المنتج:* ${p.name || 'غير محدد'}\n🔖 *كود الموديل:* ${p.id || 'غير متوفر'}\n💰 *السعر:* ${priceText}\n\n📋 *أهم المواصفات:*\n${plainDetails}\n\nيسعدنا تواصلك معنا لتأكيد الطلب أو للإجابة على أي استفسار! 📞`;

    let imageUrl = (p.images && p.images.length > 0 && p.images[0].trim() !== "") ? p.images[0].trim() : null;
    if (imageUrl) imageUrl = imageUrl.replace('http://', 'https://');

    const sendTextOnlyNative = () => {
        window.location.href = `whatsapp://send?text=${encodeURIComponent(textMessage)}`;
        releaseLock();
    };

    if (!imageUrl) {
        sendTextOnlyNative();
        return;
    }

    Swal.fire({ title: 'جاري التجهيز...', text: 'لحظات...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

    if (window.AndroidBridge && typeof window.AndroidBridge.shareToWhatsApp === "function") {
        Swal.close();
        window.AndroidBridge.shareToWhatsApp(imageUrl, textMessage);
        releaseLock();
        return;
    }

    try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (!response.ok) throw new Error("Fetch failed");
        
        const blob = await response.blob();
        const fileToShare = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        const shareData = { text: textMessage, files: [fileToShare] };

        if (!navigator.canShare || !navigator.canShare(shareData)) {
            throw new Error("Cannot share files");
        }

        Swal.close();
        await navigator.share(shareData);
        releaseLock();

    } catch (error) {
        Swal.close();
        sendTextOnlyNative(); 
    }
};

window.openCustomerModal = function(productName) {
    document.getElementById('custProduct').value = productName;
    document.getElementById('customerModal').style.display = 'flex';
};
window.closeCustomerModal = function() { document.getElementById('customerModal').style.display = 'none'; };
      
function getSellerId() { return localStorage.getItem('seller_doc_id'); }
function getSellerName() { return localStorage.getItem('seller_name'); }

window.toggleHistory = function() {
    const sec = document.getElementById('historySection');
    if (sec.style.display === 'none' || sec.style.display === '') {
        sec.style.display = 'block';
        renderHistory();
    } else {
        sec.style.display = 'none';
    }
};

window.saveCustomerData = async function() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const product = document.getElementById('custProduct').value;
    const notes = document.getElementById('custNotes').value;
    const status = document.getElementById('custStatus').value;
    const rTime = document.getElementById('reminderTime').value;

    const sellerId = getSellerId();
    const sellerName = getSellerName();

    if(!sellerId) {
        Swal.fire('تنبيه', 'يجب تسجيل الدخول أولاً!', 'warning');
        return;
    }

    if(!name || !phone) {
        Swal.fire('خطأ', 'يرجى كتابة الاسم ورقم الهاتف', 'error');
        return;
    }

    const btn = document.querySelector('.btn-save-cust');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ جاري التحقق والحفظ...';
    btn.disabled = true;

    try {
        const existCheck = await db.collection('seller_customers')
            .where('sellerId', '==', sellerId)
            .where('phone', '==', phone)
            .get();

        if (!existCheck.empty) {
            Swal.fire({
                icon: 'warning',
                title: 'العميل مسجل مسبقاً!',
                text: `هذا الرقم (${phone}) مسجل بالفعل في قائمة عملائك.`
            });
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        const reminderTimestamp = rTime ? new Date(rTime).getTime() : null;

        const docRef = await db.collection('seller_customers').add({
            sellerId: sellerId,
            sellerName: sellerName,
            name: name,
            phone: phone,
            product: product,
            notes: notes || "", 
            status: status,
            date: new Date().toLocaleDateString('ar-EG'),
            reminderAt: reminderTimestamp,
            createdAt: Date.now(),
            isNotified: rTime ? false : true 
        });

        if (reminderTimestamp) {
            try {
                if (window.AndroidBridge && typeof window.AndroidBridge.setAlarmDirect === "function") {
                    window.AndroidBridge.setAlarmDirect(
                        String(docRef.id), String(reminderTimestamp), String(name), String(product), String(phone || "")
                    );
                }
            } catch (err) {
                console.error("Bridge Error:", err);
            }
        }

        Swal.fire({ icon: 'success', title: 'تم الحفظ بنجاح', timer: 1500, showConfirmButton: false });
        closeCustomerModal();
        
        document.getElementById('custName').value = "";
        document.getElementById('custPhone').value = "";
        document.getElementById('custNotes').value = "";
        document.getElementById('reminderTime').value = "";

    } catch (e) {
        console.error("Save Error:", e);
        Swal.fire('فشل الحفظ', 'تأكد من الإنترنت والصلاحيات.\n' + e.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ==========================================
// 🚀 نظام إدارة العملاء الشامل (الحذف الفردي والمتعدد)
// ==========================================

window.enterBulkDeleteMode = function() {
    const defaultBar = document.getElementById('defaultActionBtns');
    const bulkBar = document.getElementById('bulkActionBtns');
    const table = document.getElementById('customersTable');

    if(defaultBar) defaultBar.style.display = 'none';
    if(bulkBar) bulkBar.style.display = 'flex';
    if(table) table.classList.add('bulk-active');
};

window.exitBulkDeleteMode = function() {
    const defaultBar = document.getElementById('defaultActionBtns');
    const bulkBar = document.getElementById('bulkActionBtns');
    const table = document.getElementById('customersTable');

    if(defaultBar) defaultBar.style.display = 'block';
    if(bulkBar) bulkBar.style.display = 'none';
    if(table) table.classList.remove('bulk-active');

    const selectAllBtn = document.getElementById('selectAllCust');
    if(selectAllBtn) selectAllBtn.checked = false;
    document.querySelectorAll('.cust-checkbox').forEach(cb => cb.checked = false);
};

window.toggleAllCustomers = function(source) {
    const checkboxes = document.querySelectorAll('.cust-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
};

window.updateSelectAllUI = function() {
    const allBoxes = document.querySelectorAll('.cust-checkbox');
    const checkedBoxes = document.querySelectorAll('.cust-checkbox:checked');
    const selectAll = document.getElementById('selectAllCust');
    if(selectAll && allBoxes.length > 0) {
        selectAll.checked = (allBoxes.length === checkedBoxes.length);
    }
};

window.deleteSelectedCustomers = async function() {
    const checkedBoxes = document.querySelectorAll('.cust-checkbox:checked');
    let idsToDelete =[];
    
    for (let i = 0; i < checkedBoxes.length; i++) {
        idsToDelete.push(checkedBoxes[i].value);
    }

    if (idsToDelete.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'تنبيه',
            text: 'من فضلك اختر عميل واحد على الأقل لحذفه.',
            confirmButtonText: 'حسناً',
            customClass: { popup: 'ai-swal-popup' }
        });
        return;
    }

    Swal.fire({
        title: `حذف ${idsToDelete.length} عملاء؟`,
        text: "هل أنت متأكد؟ سيتم حذف العملاء المحددين نهائياً.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="fa-solid fa-trash"></i> نعم، احذفهم',
        cancelButtonText: 'إلغاء',
        customClass: { popup: 'ai-swal-popup' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({
                title: 'جاري الحذف...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            try {
                const batch = db.batch();
                idsToDelete.forEach(docId => {
                    const docRef = db.collection('seller_customers').doc(docId);
                    batch.delete(docRef);
                    if (window.AndroidBridge && typeof window.AndroidBridge.cancelReminder === "function") {
                        window.AndroidBridge.cancelReminder(docId);
                    }
                });

                await batch.commit();

                Swal.fire({
                    icon: 'success',
                    title: 'تم الحذف بنجاح',
                    text: `تم مسح ${idsToDelete.length} سجل بنجاح.`,
                    timer: 2000,
                    showConfirmButton: false
                });

                window.exitBulkDeleteMode();

            } catch (error) {
                console.error("Bulk Delete Error:", error);
                Swal.fire({ icon: 'error', title: 'فشل الحذف', text: error.message });
            }
        }
    });
};

window.deleteCloudRecord = function(docId) {
    Swal.fire({
        title: 'تأكيد الحذف',
        text: 'هل أنت متأكد من حذف هذا العميل نهائياً؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="fa-solid fa-trash"></i> نعم، احذف',
        cancelButtonText: 'إلغاء',
        customClass: { popup: 'ai-swal-popup' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'جاري الحذف...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
            try {
                await db.collection('seller_customers').doc(docId).delete();
                if (window.AndroidBridge && typeof window.AndroidBridge.cancelReminder === "function") {
                    window.AndroidBridge.cancelReminder(docId);
                }
                Swal.fire({ icon: 'success', title: 'تم الحذف بنجاح', timer: 1500, showConfirmButton: false });
            } catch(e) {
                Swal.fire('خطأ', 'حدث خطأ أثناء الحذف: ' + e.message, 'error');
            }
        }
    });
};

window.renderHistory = function() {
    const tbody = document.getElementById('historyBody');
    const sellerId = localStorage.getItem('seller_doc_id');

    if(!tbody) return;
    if(!sellerId) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:red;">يرجى تسجيل الدخول أولاً</td></tr>';
        return;
    }

    if(window.customersUnsubscribe) window.customersUnsubscribe();

    window.customersUnsubscribe = db.collection('seller_customers')
        .where('sellerId', '==', sellerId)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            if(snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#777;">لا يوجد عملاء مسجلين</td></tr>';
                return;
            }

            tbody.innerHTML = snapshot.docs.map(doc => {
                const item = doc.data();
                const statusClass = item.status === 'تم الشراء' ? 'status-bought' : 'status-pending';
                
                return `
                <tr>
                    <td class="bulk-col">
                        <input type="checkbox" class="cust-checkbox" value="${doc.id}" onchange="updateSelectAllUI()" style="transform: scale(1.3); cursor: pointer;">
                    </td>
                    <td style="padding:10px;">${item.date || ''}</td>
                    <td style="padding:10px; font-weight:bold;">${item.name || ''}</td>
                    <td style="padding:10px;">
                        <a href="tel:${item.phone}" style="text-decoration:none; background:#e3f2fd; color:#1976d2; padding:5px 10px; border-radius:20px; font-weight:bold; font-size:12px;">
                           ${item.phone} 📞
                        </a>
                    </td>
                    <td style="font-size:11px;">${item.product || ''}</td>
                    <td class="${statusClass}">${item.status || ''}</td>
                    <td>
                        <button onclick="deleteCloudRecord('${doc.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-size:16px;">❌</button>
                    </td>
                </tr>`;
            }).join('');
        }, (error) => {
            console.error("Firestore Error:", error);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">خطأ في جلب البيانات</td></tr>';
        });
};

window.commitAllSales = async function() {
    const unsentList = safeParseJSON('unsent_sales_cache',[]);
    let history = safeParseJSON('elaraby_sales_v3',[]);
    
    const currentSellerId = localStorage.getItem('seller_doc_id');
    const currentSellerName = localStorage.getItem('seller_name');

    if (unsentList.length === 0) return Swal.fire('تنبيه', 'لا توجد مبيعات لإرسالها', 'info');
    
    if (!currentSellerId) {
        document.getElementById('app-lock-screen').style.display = 'flex';
        return Swal.fire('تنبيه', 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً', 'warning');
    }

    const btn = document.querySelector("button[onclick='commitAllSales()']");
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ جاري الرفع..."; }

    try {
        const batch = db.batch();
        const salesRef = db.collection("sales_transactions");

        unsentList.forEach(item => {
            const newDoc = salesRef.doc();
            const docData = {
                sellerId: currentSellerId,
                sellerName: currentSellerName,
                branch: item.branch,
                product: item.product,
                price: Number(item.price),
                qty: Number(item.qty) || 1,
                date: item.date,
                createdAt: Date.now()
            };

            batch.set(newDoc, docData);
            
            item.status = 'sent';
            item.firestoreId = newDoc.id;
            history.push(item);
        });

        await batch.commit();

        localStorage.setItem('unsent_sales_cache', '[]');
        localStorage.setItem('elaraby_sales_v3', JSON.stringify(history)); 
        
        Swal.fire({ title: 'تم!', text: 'تم الحفظ بنجاح', icon: 'success', timer: 1500, showConfirmButton: false });
        updateSalesUI();

    } catch (e) {
        console.error(e);
        Swal.fire('خطأ', 'فشل الإرسال: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `🚀 حفظ الكل (<span id="pending-count">0</span>)`;
        }
    }
};

const installContainer = document.getElementById('pwa-fixed-container');
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if(installContainer) {
        installContainer.style.display = 'block';
        installContainer.style.animation = 'slideInUp 0.5s ease';
    }
});

window.forceInstallPWA = async function() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if(outcome === 'accepted' && installContainer) installContainer.style.display = 'none';
    } else {
        Swal.fire({ icon: 'info', title: 'تثبيت التطبيق', text: "اضغط على خيارات المتصفح واختر 'Install App' أو 'Add to Home Screen'", confirmButtonText: 'حسناً' });
    }
};
      
function checkNet() {
    const ind = document.getElementById('net-indicator');
    const txt = document.getElementById('net-text');
    const dot = document.getElementById('dot-signal');
    if(navigator.onLine) {
        if(ind) ind.className="online-st"; if(txt) txt.innerText="متصل"; if(dot) dot.className="net-dot online-dot";
    } else {
        if(ind) ind.className="offline-st"; if(txt) txt.innerText="أوفلاين"; if(dot) dot.className="net-dot offline-dot";
    }
}
window.addEventListener('online', checkNet); window.addEventListener('offline', checkNet);

let pendingSalesList =[];

window.toggleSalesWindow = function() {
    const win = document.getElementById('salesWin');
    const isOpening = win.style.display === 'none' || win.style.display === '';
    if (!isOpening) {
        const pending = safeParseJSON('unsent_sales_cache',[]);
        if (pending.length > 0) {
            Swal.fire({
                title: 'تنبيه هام!',
                text: 'لديك مبيعات معلقة لم يتم إرسالها (غير محفوظة). هل أنت متأكد من الإغلاق؟',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#1a73e8',
                confirmButtonText: 'نعم، أغلق وأخاطر',
                cancelButtonText: 'تراجع وحفظ'
            }).then((result) => {
                if (result.isConfirmed) {
                    win.style.display = 'none'; 
                }
            });
            return; 
        }
    }

    win.style.display = isOpening ? 'block' : 'none';
    
    if(isOpening) { 
        const today = new Date().toISOString().split('T')[0];
        const dateEl = document.getElementById('s-date');
        if(dateEl) dateEl.value = today;
        
        const savedBranch = localStorage.getItem('user_branch_name');
        const branchEl = document.getElementById('s-branch');
        if(savedBranch && branchEl) branchEl.value = savedBranch;
        
        updateSalesUI(); 
    }
};

window.addToPendingList = function() {
    const branchEl = document.getElementById('s-branch');
    const prodEl = document.getElementById('s-prod');
    const priceEl = document.getElementById('s-price');
    const qtyEl = document.getElementById('s-qty'); 
    const dateEl = document.getElementById('s-date');

    if (!branchEl || !prodEl || !priceEl) return;

    const branch = branchEl.value.trim();
    const name = prodEl.value.trim();
    const price = parseFloat(priceEl.value);
    const qty = parseInt(qtyEl.value) > 0 ? parseInt(qtyEl.value) : 1;
    const date = dateEl ? dateEl.value : new Date().toISOString().split('T')[0];

    if (!name || !price || !branch) {
        return Swal.fire('تنبيه', 'يرجى ملء البيانات (الفرع، المنتج، السعر)', 'warning');
    }

    localStorage.setItem('user_branch_name', branch);

    const newEntry = {
        localId: "TEMP_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        branch: branch,
        product: name,
        price: price,
        qty: qty, 
        date: date,
        status: 'unsent'
    };

    let unsentList = safeParseJSON('unsent_sales_cache',[]);
    unsentList.push(newEntry);
    localStorage.setItem('unsent_sales_cache', JSON.stringify(unsentList));

    prodEl.value = '';
    priceEl.value = '';
    if(qtyEl) qtyEl.value = '1'; 
    prodEl.focus();

    updateSalesUI();
};

let salesListener = null;

window.updateSalesUI = function() {
    const tbody = document.getElementById('sales-list-body');
    const unsentList = safeParseJSON('unsent_sales_cache',[]); 
    const sDateEl = document.getElementById('s-date');
    const selectedDate = (sDateEl && sDateEl.value) ? sDateEl.value : new Date().toISOString().split('T')[0];
    const dayTotalEl = document.getElementById('day-total');
    const currentSellerId = localStorage.getItem('seller_doc_id');

    if (!tbody) return;

    let html = "";
    let localTotal = 0;

    unsentList.forEach(item => {
        const rowTotal = (Number(item.price) || 0) * (Number(item.qty) || 1);
        localTotal += rowTotal;
        html += `
        <tr style="background-color: #fff8e1;">
            <td style='padding:8px;'>${item.branch}</td>
            <td style='padding:8px;'>${item.product} (غير محفوظ)</td>
            <td style='padding:8px;'>${item.qty}</td>
            <td style='font-weight:bold; color:#f57c00;'>${item.price.toLocaleString()}</td>
            <td onclick="removeFromUnsent('${item.localId}')" style="cursor:pointer; color:red;">&#10006;</td>
        </tr>`;
    });

    if (salesListener) salesListener(); 

    salesListener = db.collection('sales_transactions')
        .where('sellerId', '==', currentSellerId)
        .where('date', '==', selectedDate)
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
            let serverHtml = "";
            let serverTotal = 0;

            snap.forEach(doc => {
                const item = doc.data();
                const rowTotal = (Number(item.price) || 0) * (Number(item.qty) || 1);
                serverTotal += rowTotal;

                serverHtml += `
                <tr style="background:#f0fdf4;">
                    <td style='padding:8px;'>${item.branch}</td>
                    <td style='padding:8px;'>${item.product}</td>
                    <td style='padding:8px;'>${item.qty || 1}</td>
                    <td style='font-weight:bold; color:#1a73e8;'>${item.price.toLocaleString()}</td>
                    <td style="padding:8px;">
                        <button onclick="deleteServerSale('${doc.id}')" style="background:none; border:none; cursor:pointer;">❌</button>
                    </td>
                </tr>`;
            });

            tbody.innerHTML = html + serverHtml;
            if (dayTotalEl) dayTotalEl.innerText = (localTotal + serverTotal).toLocaleString();
        });
};

window.removeFromUnsent = function(localId) {
    let unsent = safeParseJSON('unsent_sales_cache',[]);
    unsent = unsent.filter(i => i.localId !== localId);
    localStorage.setItem('unsent_sales_cache', JSON.stringify(unsent));
    updateSalesUI();
};

window.deleteSaleEntry = async function(localId) {
    Swal.fire({
        title: 'تأكيد الحذف',
        text: 'هل تريد حذف هذه العملية من السجل والسيرفر نهائياً؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        customClass: { popup: 'ai-swal-popup' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            let history = safeParseJSON('elaraby_sales_v3',[]);
            const item = history.find(i => i.localId === localId);
            
            if(item && item.firestoreId && navigator.onLine) {
                await db.collection("sales_transactions").doc(item.firestoreId).delete().catch(console.error);
            }
            
            history = history.filter(i => i.localId !== localId);
            localStorage.setItem('elaraby_sales_v3', JSON.stringify(history));
            updateSalesUI();
            
            Swal.fire({ icon: 'success', title: 'تم الحذف بنجاح', timer: 1500, showConfirmButton: false });
        }
    });
};

document.addEventListener('DOMContentLoaded', function() {
    const hint = document.getElementById('salesHint');
    if (hint) {
        const hideHint = () => {
            hint.classList.remove('show-tooltip');
            setTimeout(() => { 
                if (!hint.classList.contains('show-tooltip')) {
                    hint.style.visibility = 'hidden'; 
                }
            }, 500); 
        };
        setTimeout(() => {
            hint.style.visibility = 'visible'; 
            hint.classList.add('show-tooltip');
        }, 1500);
        hint.onclick = hideHint;
        const onScroll = () => {
            if (window.scrollY > 50) {
                hideHint();
                window.removeEventListener('scroll', onScroll); 
            }
        };
        window.addEventListener('scroll', onScroll);
        setTimeout(hideHint, 8000);
    }
});

window.openTour = function() { 
    document.getElementById('tourModal').style.display='flex'; 
    document.body.style.overflow = 'hidden'; 
};

window.closeTour = function() { 
    document.getElementById('tourModal').style.display='none'; 
    document.body.style.overflow = 'auto'; 
    localStorage.setItem('tour_seen','true'); 
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("⚡ جاري جلب البيانات من الكاش السريع...");
    try {
        const cachedData = await localforage.getItem(CACHE_KEY);
        if (cachedData && cachedData.length > 0) {
            console.log("✅ تم استرجاع البيانات محلياً في أجزاء من الثانية");
            products = Object.freeze(cachedData.map(Object.freeze));
            renderCategories(); 
        }
    } catch(e) {
        console.warn("فشل قراءة الكاش المحلي:", e);
    }

    setTimeout(() => {
        backgroundSync();
        renderHistory();
        setTimeout(() => {
            if(typeof startCloudReminderSystem === 'function') {
                startCloudReminderSystem();
            }
        }, 15000); 
    }, 100); 
});

async function backgroundSync() {
    try {
        const localUpdateTime = await localforage.getItem(CACHE_TIME_KEY) || 0;
        const metaDoc = await db.collection("app_config").doc("metadata").get({ source: 'server' });
        const serverUpdateTime = metaDoc.exists ? metaDoc.data().last_update_time : 0;

        if (serverUpdateTime > localUpdateTime) {
            console.log("تحديث جديد متاح.. جاري الجلب");
            const snapshot = await db.collection("products").get({ source: 'server' });
            const rawProducts = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            products = Object.freeze(rawProducts.map(Object.freeze));
            await localforage.setItem(CACHE_KEY, rawProducts);
            await localforage.setItem(CACHE_TIME_KEY, serverUpdateTime);
            renderCategories();
        }
    } catch (error) {
        console.warn("أوفلاين أو خطأ", error);
    }
}

db.collection("ads_campaigns").where("isActive", "==", true).onSnapshot((snapshot) => {
    clearAllAds();
    if (snapshot.empty) return;
    snapshot.forEach(doc => {
        renderAdCampaign(doc.data());
    });
}, (error) => {
    console.error("❌ خطأ في جلب الإعلانات:", error);
});

function clearAllAds() {
    document.querySelectorAll('.dynamic-ad-slot').forEach(el => el.remove());
    const oldPopup = document.getElementById('dynamic-popup-ad');
    if (oldPopup) oldPopup.remove();
}

function renderAdCampaign(ad) {
    let content = ad.sourceType === 'code' ? ad.htmlCode : `
        <a href="${ad.link || '#'}" target="_blank" style="display:block; width:100%; text-decoration:none;">
            <img src="${ad.img}" style="width:100%; height:auto; display:block; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1);" alt="${ad.label}">
        </a>
    `;

    switch(ad.position) {
        case 'popup': renderPopup(content, ad.timer); break;
        case 'top_bar': insertAd(content, '.main-app-container', 'prepend', 'margin-bottom:20px;'); break;
        case 'below_search': insertAd(content, '.search-wrapper', 'afterend', 'margin:20px auto; max-width:100%;'); break;
        case 'footer': insertAd(content, '.app-footer', 'beforebegin', 'margin-top:30px;'); break;
        case 'floating_bottom': renderFloatingBottom(content); break;
    }
}

function insertAd(content, selector, position, style = "") {
    const target = document.querySelector(selector);
    if (!target) return;
    const adDiv = document.createElement('div');
    adDiv.className = 'dynamic-ad-slot';
    adDiv.style.cssText = `width:100%; overflow:hidden; text-align:center; ${style}`;
    adDiv.innerHTML = content;
    if (position === 'prepend') target.prepend(adDiv);
    else if (position === 'append') target.append(adDiv);
    else if (position === 'afterend') target.insertAdjacentElement('afterend', adDiv);
    else if (position === 'beforebegin') target.insertAdjacentElement('beforebegin', adDiv);
    runScripts(adDiv);
}

function renderPopup(content, timer) {
    if(document.getElementById('dynamic-popup-ad')) return;
    const popupHTML = `
      <div id="dynamic-popup-ad" style="position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:99999; display:flex; align-items:center; justify-content:center; animation:zoomIn 0.3s ease;">
          <div style="background:#fff; padding:0; border-radius:15px; max-width:90%; width:400px; position:relative; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
              <button onclick="document.getElementById('dynamic-popup-ad').remove()" 
                      style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.6); color:#fff; border:none; width:32px; height:32px; border-radius:50%; cursor:pointer; font-weight:bold; z-index:10; font-size:18px; line-height:1;">
                  &times;
              </button>
              <div style="max-height:80vh; overflow-y:auto;">${content}</div>
              ${timer > 0 ? `<div id="popup-timer-bar" style="height:5px; background:#e91e63; width:100%; transition:width ${timer}s linear;"></div>` : ''}
          </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', popupHTML);
    const popupEl = document.getElementById('dynamic-popup-ad');
    runScripts(popupEl);
    if (timer > 0) {
        setTimeout(() => { const bar = document.getElementById('popup-timer-bar'); if(bar) bar.style.width = '0%'; }, 100);
        setTimeout(() => { if(popupEl) popupEl.remove(); }, timer * 1000);
    }
}

function renderFloatingBottom(content) {
    const floatDiv = document.createElement('div');
    floatDiv.className = 'dynamic-ad-slot';
    floatDiv.style.cssText = `position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; border-top: 1px solid #ddd; z-index: 10000; text-align: center; padding: 5px; box-shadow: 0 -5px 15px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; min-height: 60px;`;
    const closeBtn = `<button onclick="this.parentElement.remove()" style="position:absolute; top:-15px; right:10px; background:#333; color:#fff; border:none; border-radius:50%; width:25px; height:25px; cursor:pointer; z-index:10001;">×</button>`;
    floatDiv.innerHTML = closeBtn + content;
    document.body.appendChild(floatDiv);
    document.body.style.paddingBottom = "80px";
    runScripts(floatDiv);
}

function runScripts(container) {
    const scripts = container.querySelectorAll("script");
    scripts.forEach((oldScript) => {
        const newScript = document.createElement("script");
        Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const maintBtn = document.getElementById('maintBtn');
    const maintMenu = document.getElementById('maintMenu');
    if (maintBtn && maintMenu) {
        maintBtn.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            maintMenu.classList.toggle('show-maint');
            document.getElementById('btechMenu').classList.remove('show-maint');
        });
    }

    const btechBtn = document.getElementById('btechBtn');
    const btechMenu = document.getElementById('btechMenu');
    if (btechBtn && btechMenu) {
        btechBtn.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            btechMenu.classList.toggle('show-maint');
            document.getElementById('maintMenu').classList.remove('show-maint');
        });
    }

    document.addEventListener('click', function() {
        if(maintMenu) maintMenu.classList.remove('show-maint');
        if(btechMenu) btechMenu.classList.remove('show-maint');
    });

    window.toggleBtechMenu = function() {
        if(btechMenu) btechMenu.classList.remove('show-maint');
    };
});

window.toggleRecentMenu = function() {
    var menu = document.getElementById('recent-drop-list');
    if(menu) menu.classList.toggle('show');
};

window.addEventListener('click', function(e) {
    if (!e.target.closest('.recent-wrapper')) {
        var menu = document.getElementById('recent-drop-list');
        if(menu) menu.classList.remove('show');
    }
});

window.loadRecentSearches = function() {
    var wrapper = document.getElementById("recent-wrapper-box");
    var list = document.getElementById("recent-drop-list");
    if(!wrapper || !list) return; 

    var recent = safeParseJSON(RECENT_SEARCH_KEY,[]);
    if (recent.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = 'flex';
    var html = recent.map(function(r) {
        return '<div class="recent-list-item" onclick="applyRecentSearch(\'' + r + '\')"><span>' + r + '</span><span style="font-size:10px; opacity:0.5;">↖</span></div>';
    }).join('');
    html += '<div class="recent-list-item" onclick="clearRecentSearches()" style="color:red; justify-content:center; font-weight:bold; background:#fff5f5;">🗑️ مسح الكل</div>';
    list.innerHTML = html;
};

window.applyRecentSearch = function(txt) {
    var inp = document.getElementById('main-search');
    if(inp) inp.value = txt;
    var menu = document.getElementById('recent-drop-list');
    if(menu) menu.classList.remove('show');
    if(typeof doSearch === 'function') doSearch();
};

window.clearRecentSearches = function() {
    localStorage.removeItem(RECENT_SEARCH_KEY);
    loadRecentSearches();
};

setTimeout(function(){ 
    if(typeof loadRecentSearches === 'function') loadRecentSearches(); 
}, 500);

window.openBundleModal = function() {
    document.getElementById('bundleModal').style.display = 'flex';
    const searchInput = document.getElementById('bundleSearch');
    if(searchInput) searchInput.value = '';
    document.getElementById('no-bundles-msg').style.display = 'none';
    loadBundlesData();
};

window.closeBundleModal = function() { document.getElementById('bundleModal').style.display = 'none'; };

window.filterClientBundles = function() {
    const input = document.getElementById('bundleSearch').value.toLowerCase();
    const tableBody = document.getElementById('bundleTableBody');
    const rows = tableBody.getElementsByTagName('tr');
    const noMsg = document.getElementById('no-bundles-msg');
    let hasResults = false;

    for (let i = 0; i < rows.length; i++) {
        const text = rows[i].textContent.toLowerCase();
        if (text.includes(input)) {
            rows[i].style.display = "";
            hasResults = true;
        } else {
            rows[i].style.display = "none";
        }
    }
    if(noMsg) noMsg.style.display = hasResults ? 'none' : 'block';
};

function loadBundlesData() {
    const tbody = document.getElementById('bundleTableBody');
    db.collection("bundle_codes").orderBy("createdAt", "desc").get().then((querySnapshot) => {
        if (querySnapshot.empty) {
            tbody.innerHTML = "<tr><td colspan='2' style='text-align:center; padding:20px;'>لا توجد أكواد نشطة حالياً 📭</td></tr>";
            return;
        }
        let html = "";
        querySnapshot.forEach((doc) => {
            const d = doc.data();
            html += `<tr><td><div style="font-weight:bold;">${d.name}</div><div style="font-size:11px; color:#777;">${d.desc || ''}</div></td><td style="text-align:center; width:120px;"><div class="code-badge" onclick="copyCode('${d.code}')">${d.code} <i class="far fa-copy"></i></div></td></tr>`;
        });
        tbody.innerHTML = html;
        filterClientBundles();
    }).catch((error) => {
        tbody.innerHTML = "<tr><td colspan='2' style='color:red; text-align:center;'>خطأ في التحميل</td></tr>";
    });
}

window.copyCode = function(code) {
    navigator.clipboard.writeText(code).then(() => {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم نسخ الكود: ' + code, showConfirmButton: false, timer: 2000 });
    });
};
      
document.getElementById('bundleModal').addEventListener('click', function(e) {
    if (e.target === this) closeBundleModal();
});

let SERVER_ACCESS_CODE = ""; 

db.collection("app_config").doc("access_control").onSnapshot((doc) => {
    if (doc.exists) {
        const data = doc.data();
        const newCode = data.searchPageCode;
        SERVER_ACCESS_CODE = newCode;

        const isLoggedIn = localStorage.getItem('is_verified_seller') === 'true';
        const userSavedCode = localStorage.getItem('saved_access_code');

        if (isLoggedIn && userSavedCode && userSavedCode !== newCode) {
            console.log("⛔ الكود تغير! جاري طرد المستخدم...");
            forceLogout("⚠️ تم تغيير كود الدخول من الإدارة.\nيرجى إدخال الكود الجديد للمتابعة.");
        }
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    const savedUser = localStorage.getItem('seller_username');
    const savedDocId = localStorage.getItem('seller_doc_id'); 
    
    if (savedUser && savedDocId) {
        monitorUserSession(savedDocId);
        document.getElementById('app-lock-screen').style.display = 'none';
        
        const savedBranch = localStorage.getItem('seller_branch');
        const branchField = document.getElementById('s-branch');
        if(branchField && savedBranch) branchField.value = savedBranch;
        if (!localStorage.getItem('tour_seen')) {
            setTimeout(() => { openTour(); }, 1000);
        }
    } else {
        document.getElementById('app-lock-screen').style.display = 'flex';
    }
});

window.performLogin = async function() {
    const userInp = document.getElementById('login-user').value.trim().toLowerCase();
    const passInp = document.getElementById('login-pass').value.trim();
    const btn = document.getElementById('login-btn');
    const msg = document.getElementById('login-msg');

    if (!userInp || !passInp) {
        msg.style.display = 'block'; msg.innerText = "يرجى إدخال البيانات"; return;
    }

    btn.disabled = true; btn.innerText = "⏳ جاري التحقق..."; msg.style.display = 'none';

    try {
        const sellerEmail = `${userInp}@elaraby.com`;
        const userCredential = await firebase.auth().signInWithEmailAndPassword(sellerEmail, passInp);
        const uid = userCredential.user.uid;

        const docRef = await db.collection('sellers_accounts').doc(uid).get();
        if (!docRef.exists) throw new Error("بيانات الحساب غير مكتملة");
        
        const userData = docRef.data();
        if (userData.isActive === false) throw new Error("⛔ هذا الحساب محظور.");

        const uniqueSessionId = Date.now() + "_" + Math.floor(Math.random() * 1000000);
        await db.collection('sellers_accounts').doc(uid).update({
            active_session_id: uniqueSessionId,
            last_login_time: Date.now()
        });
        localStorage.setItem('current_session_id', uniqueSessionId);

        const oldUser = localStorage.getItem('seller_username');
        if (oldUser && oldUser !== userData.username) {
            localStorage.removeItem('unsent_sales_cache');
            localStorage.removeItem('elaraby_sales_v3');
        }

        localStorage.setItem('seller_username', userData.username);
        localStorage.setItem('seller_doc_id', uid);
        localStorage.setItem('seller_name', userData.name);
        localStorage.setItem('seller_branch', userData.branch);
        localStorage.setItem('is_verified_seller', 'true');

        document.getElementById('app-lock-screen').style.opacity = '0';
        setTimeout(() => { document.getElementById('app-lock-screen').style.display = 'none'; }, 500);

        if(window.renderHistory) window.renderHistory();

        const currentHour = new Date().getHours();
        const greetingMsg = (currentHour < 12) ? 'صباح الخير' : 'مساء الخير';
        
        Swal.fire({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true,
            background: '#ffffff',
            customClass: { popup: 'saas-welcome-toast' },
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            },
            html: `
                <div style="display: flex; align-items: center; gap: 15px; text-align: right;">
                    <div style="background: linear-gradient(135deg, #1a73e8, #0b5099); color: white; min-width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 4px 15px rgba(26,115,232,0.3);">
                        <i class="fa-solid fa-hand-wave">👋</i>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 5px 0; color: #1e293b; font-size: 15px; font-weight: 800; font-family: 'Cairo', sans-serif;">
                            ${greetingMsg}، ${userData.name}
                        </h4>
                        <p style="margin: 0; color: #64748b; font-size: 13px; font-weight: 600; font-family: 'Cairo', sans-serif;">
                            مرحباً بك في فرع <span style="color: #1a73e8; font-weight: 800;">${userData.branch || 'الرئيسي'}</span>
                        </p>
                    </div>
                </div>
            `
        });
    
        monitorUserSession(uid);
        triggerEdgeMenuHint();

        if (!localStorage.getItem('tour_seen')) {
            setTimeout(() => { openTour(); }, 3500);
        }

    } catch (error) {
        msg.style.display = 'block';
        if(error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            msg.innerText = "❌ اسم المستخدم أو كلمة المرور غير صحيحة";
        } else {
            msg.innerText = error.message;
        }
    } finally {
        btn.disabled = false; btn.innerText = "تسجيل الدخول";
    }
};

function monitorUserSession(docId) {
    if (!docId) return;

    db.collection('sellers_accounts').doc(docId).update({ lastSeen: Date.now() }).catch(()=>{});

    let lastUpdateTime = Date.now();
    window.triggerUserActivity = () => {
        const now = Date.now();
        if (now - lastUpdateTime > 4 * 60 * 1000) { 
            db.collection('sellers_accounts').doc(docId).update({ lastSeen: now }).catch(()=>{});
            lastUpdateTime = now;
        }
    };

    const searchInput = document.getElementById('main-search');
    if (searchInput) {
        searchInput.addEventListener('input', window.triggerUserActivity); 
        searchInput.addEventListener('keypress', window.triggerUserActivity);
    }

    document.addEventListener('click', function(e) {
        const t = e.target;
        if (
            t.closest('button') || t.tagName === 'INPUT' || t.tagName === 'SELECT' || 
            t.closest('.sug-item') || t.closest('.cat-main-text') || t.closest('.thumb-item') || t.closest('.card-footer-actions')
        ) {
            window.triggerUserActivity();
        }
    });

    if (window.sessionUnsubscribe) window.sessionUnsubscribe();

    window.sessionUnsubscribe = db.collection('sellers_accounts').doc(docId)
        .onSnapshot({ includeMetadataChanges: true }, (doc) => {
            if (doc.metadata.fromCache) return; 

            if (doc.exists) {
                const data = doc.data();
                const localSession = localStorage.getItem('current_session_id');
                const serverSession = data.active_session_id;

                if (data.isActive === false) {
                    forceLogout("⛔ تم حظر حسابك من قبل الإدارة.");
                    return;
                }

                if (localSession && serverSession && localSession !== serverSession) {
                    forceLogout("⚠️ تم تسجيل الدخول من جهاز آخر.\nتم إنهاء جلستك هنا للأمان.");
                }
            }
        }, (error) => {
            console.log("Monitoring paused, ignoring to keep session alive.");
        });
}

async function forceLogout(reason) {
    if (window.sessionUnsubscribe) window.sessionUnsubscribe();

    try { await firebase.auth().signOut(); } catch(e) { console.error(e); }

    localStorage.removeItem('seller_username');
    localStorage.removeItem('seller_doc_id');
    localStorage.removeItem('current_session_id');
    localStorage.removeItem('is_verified_seller');
    localStorage.removeItem('edge_hint_seen');
    
    const screen = document.getElementById('app-lock-screen');
    const msgBox = document.getElementById('login-msg');
    
    if (screen) {
        screen.style.display = 'flex';
        screen.style.opacity = '1';
    }

    const userInp = document.getElementById('login-user');
    const passInp = document.getElementById('login-pass');
    if(userInp) userInp.value = '';
    if(passInp) passInp.value = '';
    
    if(msgBox) {
        msgBox.innerText = reason;
        msgBox.style.display = 'block';
        msgBox.style.padding = '10px';
        msgBox.style.background = '#ffebee';
        msgBox.style.border = '1px solid red';
        msgBox.style.borderRadius = '8px';
    }

    if (typeof closeEdgeSidebar === 'function') closeEdgeSidebar();
}

window.doLogout = function() {
    Swal.fire({
        title: 'تسجيل الخروج',
        text: "هل تريد الخروج من الحساب؟",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، خروج',
        cancelButtonText: 'إلغاء'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'جاري تسجيل الخروج...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

            if (window.sessionUnsubscribe) window.sessionUnsubscribe();

            const docId = localStorage.getItem('seller_doc_id');
            if(docId) {
                try { await db.collection('sellers_accounts').doc(docId).update({ active_session_id: null }); } catch(e) {}
            }

            try { await firebase.auth().signOut(); } catch(e) {}

            localStorage.removeItem('seller_username');
            localStorage.removeItem('seller_doc_id');
            localStorage.removeItem('current_session_id');
            localStorage.removeItem('is_verified_seller');
            localStorage.removeItem('edge_hint_seen'); 
            
            const screen = document.getElementById('app-lock-screen');
            if (screen) {
                screen.style.display = 'flex';
                screen.style.opacity = '1';
            }

            const userInp = document.getElementById('login-user');
            const passInp = document.getElementById('login-pass');
            if(userInp) userInp.value = '';
            if(passInp) passInp.value = '';

            const msgBox = document.getElementById('login-msg');
            if(msgBox) msgBox.style.display = 'none';

            if (typeof closeEdgeSidebar === 'function') closeEdgeSidebar();
            Swal.close();
        }
    });
};

var isGoogleBot = /bot|googlebot|crawler|spider|robot|crawling/i.test(navigator.userAgent);
if (!isGoogleBot) {
    document.addEventListener('contextmenu', function(event) { event.preventDefault(); });
    document.onkeydown = function(e) {
        if (e.keyCode == 123 || (e.ctrlKey && e.shiftKey && e.keyCode == 73) || (e.ctrlKey && e.shiftKey && e.keyCode == 67) || 
            (e.ctrlKey && e.shiftKey && e.keyCode == 74) || (e.ctrlKey && e.keyCode == 85) || (e.ctrlKey && e.keyCode == 83)) {
            return false;
        }
    };
    window.onbeforeprint = function() { document.body.style.display = "none"; };
    window.onafterprint = function() { document.body.style.display = "block"; };
}

window.onbeforeunload = function() {
    const pending = safeParseJSON('unsent_sales_cache',[]);
    if (pending.length > 0) {
        return "لديك مبيعات غير محفوظة! هل أنت متأكد من الخروج؟";
    }
};

let activeRemindersList =[]; 
let reminderUnsubscribe = null; 

function startCloudReminderSystem() {
    const sellerId = localStorage.getItem('seller_doc_id');
    if (!sellerId) return;

    if (reminderUnsubscribe) reminderUnsubscribe();

    db.collection('seller_customers').where('sellerId', '==', sellerId).where('isNotified', '==', false).get().then((snapshot) => {
        activeRemindersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const now = Date.now();
        activeRemindersList.forEach(customer => {
            if (customer.reminderAt && customer.reminderAt > now) {
                if (window.AndroidBridge && window.AndroidBridge.setAlarmDirect) {
                    window.AndroidBridge.setAlarmDirect(
                        String(customer.id), String(customer.reminderAt), String(customer.name), String(customer.product), String(customer.phone || "")
                    );
                }
            }
        });
    }).catch(err => console.log("Reminder Error:", err));
}

function showCloudAlert(customer) {
    if (document.visibilityState === 'visible') {
        if (window.navigator && window.navigator.vibrate) window.navigator.vibrate([500, 110, 500]);
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            osc.connect(audioCtx.destination);
            osc.start(); osc.stop(audioCtx.currentTime + 1);
        } catch(e) {}

        Swal.fire({
            title: '🔔 تذكير بموعد اتصال',
            html: `
                <div style="font-size:16px; margin-bottom:20px; text-align:right; line-height:1.6;">
                    العميل: <b>${customer.name}</b><br>
                    المنتج: <b style="color:#1a73e8;">${customer.product}</b><br>
                    الهاتف: <b style="direction:ltr; display:inline-block;">${customer.phone}</b>
                </div>
                <button onclick="handleCloudCall('${customer.id}', '${customer.phone}')" style="background:#28a745; color:white; border:none; padding:15px; border-radius:10px; cursor:pointer; font-weight:bold; width:100%; font-size:16px; margin-bottom:10px;">📞 اتصل الآن</button>
                <button onclick="postponeCloudReminder('${customer.id}')" style="background:#f59e0b; color:white; border:none; padding:12px; border-radius:10px; cursor:pointer; font-weight:bold; width:100%; font-size:14px; margin-bottom:10px;">⏳ ذكرني لاحقاً (15 دقيقة)</button>
                <button onclick="ignoreCloudReminder('${customer.id}')" style="background:#6b7280; color:white; border:none; padding:10px; border-radius:10px; cursor:pointer; width:100%; font-size:13px;">تجاهل</button>
            `,
            showConfirmButton: false,
            allowOutsideClick: false,
            customClass: { backdrop: 'reminder-backdrop' }
        });
    }

    if ("Notification" in window && Notification.permission === "granted") {
        navigator.serviceWorker.ready.then(function(registration) {
            registration.showNotification("🔔 حان موعد الاتصال بالعميل!", {
                body: `العميل: ${customer.name}\nالمنتج: ${customer.product}\nاضغط هنا للاتصال به الآن.`,
                icon: "https://i.top4top.io/p_3662hu6pn1.png", 
                vibrate:[500, 200, 500, 200, 500],
                requireInteraction: true, 
                tag: customer.id, 
                data: { phone: customer.phone, id: customer.id }
            });
        });
    }

    const index = activeRemindersList.findIndex(c => c.id === customer.id);
    if(index > -1) activeRemindersList.splice(index, 1);
}

window.handleCloudCall = async function(docId, phone) {
    Swal.close();
    window.location.href = "tel:" + phone;

    try {
        const now = new Date();
        const timeLog = now.toLocaleDateString('ar-EG') + " " + now.toLocaleTimeString('ar-EG');
        const note = `\n✅ [تم الاتصال في: ${timeLog}]`;
        const docRef = db.collection('seller_customers').doc(docId);
        
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (!doc.exists) return;
            const newNotes = (doc.data().notes || "") + note;
            transaction.update(docRef, { status: "تم الاتصال", notes: newNotes, isNotified: true });
        });

        if (window.AndroidBridge && window.AndroidBridge.cancelReminder) {
            window.AndroidBridge.cancelReminder(docId);
        }

        const Toast = Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000});
        Toast.fire({icon: 'success', title: 'تم تحديث حالة العميل'});
    } catch(e) { console.error("Call Update Error", e); }
};

window.postponeCloudReminder = async function(docId) {
    Swal.close();
    try {
        const newTime = Date.now() + (15 * 60 * 1000);
        await db.collection('seller_customers').doc(docId).update({ reminderAt: newTime, isNotified: false });

        if (window.AndroidBridge && window.AndroidBridge.setAlarm) {
            const customer = activeRemindersList.find(c => c.id === docId);
            if (customer) {
                const alarmData = { id: docId, time: newTime, name: customer.name || "عميل", prod: customer.product || "منتج", phone: customer.phone || "" };
                window.AndroidBridge.setAlarm(JSON.stringify(alarmData));
            }
        }
        Swal.fire({ icon: 'success', title: 'تم التأجيل 15 دقيقة', timer: 1500, showConfirmButton: false });
    } catch(e) {}
};

function searchSalesProd(val) {
    const box = document.getElementById('sales-sug-list');
    const input = document.getElementById('s-prod');
    const q = val ? val.trim().toLowerCase() : '';

    if (!q) { box.style.display = 'none'; return; }

    const matches = products.filter(p => (p.name && p.name.toLowerCase().includes(q)) || (p.id && p.id.toLowerCase().includes(q))).slice(0, 10);

    if (matches.length === 0) { box.style.display = 'none'; return; }

    box.innerHTML = matches.map(p => `
        <div class="sug-item" onclick="selectSalesProd('${escapeStr(p.name)}', '${p.price}', '${p.id}')" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; text-align:right; font-size:12px; background:#fff;">
            <div style="font-weight:bold; color:#1a73e8;">${p.name}</div>
            <div style="display:flex; justify-content:space-between; color:#666;"><span>${p.id}</span><span style="color:#28a745;">${formatPriceForDisplay(p.price)}</span></div>
        </div>
    `).join('');
    box.style.display = 'block';
}

function selectSalesProd(name, price, id) {
    document.getElementById('s-prod').value = name;
    const priceField = document.getElementById('s-price');
    if(priceField && price) priceField.value = price;
    document.getElementById('sales-sug-list').style.display = 'none';
}

document.addEventListener('click', function(e) {
    const box = document.getElementById('sales-sug-list');
    const input = document.getElementById('s-prod');
    if (e.target !== box && e.target !== input) { if(box) box.style.display = 'none'; }
});

function dismissNotification() {
    const bar = document.getElementById('sys-notification-bar');
    if (bar) {
        bar.classList.remove('active-notify');
        setTimeout(() => { bar.style.display = 'none'; }, 500);
    }
}

document.addEventListener('click', function(e) {
    const searchInput = document.getElementById('main-search');
    const suggestBox = document.getElementById('sug-box');
    if (!searchInput || !suggestBox) return;
    if (!searchInput.contains(e.target) && !suggestBox.contains(e.target)) {
        suggestBox.style.display = 'none';
    }
});

window.deleteServerSale = function(docId) {
    Swal.fire({
        title: 'تأكيد الحذف',
        text: "هل أنت متأكد من حذف هذه العملية من السيرفر نهائياً؟",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، حذف',
        cancelButtonText: 'إلغاء'
    }).then((result) => {
        if (result.isConfirmed) {
            db.collection("sales_transactions").doc(docId).delete()
            .then(() => {
                const Toast = Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000});
                Toast.fire({icon: 'success', title: 'تم الحذف بنجاح'});
            })
            .catch((error) => { Swal.fire('خطأ', error.message, 'error'); });
        }
    });
};

window.compareProductId = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

window.fetchGeminiAPI = async function(prompt) {
    if (!window.aiConfig || !window.aiConfig.apiKey) {
        throw new Error("لم يتم إضافة مفتاح الـ API من لوحة التحكم.");
    }
    const apiKey = window.aiConfig.apiKey;
    let validModels = JSON.parse(sessionStorage.getItem('valid_gemini_models') || '[]');

    if (validModels.length === 0) {
        try {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listRes = await fetch(listUrl);
            if (listRes.ok) {
                const listData = await listRes.json();
                if (listData.models) {
                    validModels = listData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")).map(m => m.name.split('/')[1]);
                    sessionStorage.setItem('valid_gemini_models', JSON.stringify(validModels));
                }
            }
        } catch (e) { console.warn("فشل جلب قائمة الموديلات ديناميكياً."); }
    }

    if (validModels.length === 0) { validModels =["gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash-latest"]; }

    const preferredOrder =["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro"];
    let modelsToTry = preferredOrder.filter(m => validModels.includes(m));
    if (modelsToTry.length === 0) modelsToTry = validModels;

    async function attemptFetch(retryIndex) {
        if (retryIndex >= modelsToTry.length) {
            throw new Error("سيرفرات الذكاء الاصطناعي عليها ضغط شديد حالياً. يرجى المحاولة بعد قليل ⏱️.");
        }

        const selectedModel = modelsToTry[retryIndex];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            safetySettings:[
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        try {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();

            if (!response.ok) {
                const errorMsg = data.error?.message || "";
                if (errorMsg.includes("not found") || errorMsg.includes("high demand") || response.status === 404 || response.status === 503 || response.status === 429) {
                    await sleep(1000); 
                    return await attemptFetch(retryIndex + 1); 
                }
                throw new Error(errorMsg);
            }
            if (!data.candidates || data.candidates.length === 0) throw new Error("تم حظر الرد من قبل الذكاء الاصطناعي.");
            return data.candidates[0].content.parts[0].text;
            
        } catch (error) {
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') throw new Error("تأكد من اتصالك بالإنترنت.");
            throw error;
        }
    }
    return await attemptFetch(0);
};

window.aiCompareMenu = function(productId) {
    if (!window.aiConfig || !window.aiConfig.apiKey) {
        return Swal.fire('تنبيه', 'ميزة الذكاء الاصطناعي غير مفعلة. يرجى إضافة مفتاح API من لوحة التحكم.', 'warning');
    }
    if (window.compareProductId && window.compareProductId !== productId) {
        executeInternalCompare(window.compareProductId, productId);
        return;
    }
    if (window.compareProductId === productId) {
        resetCompareState(productId);
        return;
    }
    Swal.fire({
        title: '⚖️ اختار نوع المقارنة',
        html: `
            <div class="pro-comp-container">
                <div class="pro-comp-card internal" onclick="Swal.close(); setTimeout(() => startInternalCompare('${productId}'), 300)">
                    <div class="pro-comp-icon"><i class="fas fa-store"></i></div><h4>منتج من العربى</h4><p>قارن بمنتج تاني من ماركات العربي الموجودة في التطبيق.</p>
                </div>
                <div class="pro-comp-card external" onclick="Swal.close(); setTimeout(() => promptCompetitorCompare('${productId}'), 300)">
                    <div class="pro-comp-icon"><i class="fas fa-globe"></i></div><h4>منتج منافس (خارجي)</h4><p>اكتب كود أو اسم أي منتج في السوق ليتم تحليله.</p>
                </div>
            </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'إلغاء',
        customClass: { popup: 'ai-swal-popup' }
    });
};

function startInternalCompare(productId) {
    window.compareProductId = productId;
    const btn = document.getElementById(`btn-compare-${productId}`);
    if (btn) { btn.innerHTML = '🔄 اختر منتجاً آخر للمقارنة'; btn.style.background = '#f59e0b'; }
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'تم التحديد! اختر منتجاً آخر للمقارنة.', showConfirmButton: false, timer: 4000 });
}

function resetCompareState(productId) {
    const btn = document.getElementById(`btn-compare-${productId}`);
    if (btn) { btn.innerHTML = '⚖️ قارن منتجين'; btn.style.background = 'linear-gradient(135deg, #3B82F6, #2563EB)'; }
    window.compareProductId = null;
}

function executeInternalCompare(product1Id, product2Id) {
    const product1 = products.find(p => p.id === product1Id);
    const product2 = products.find(p => p.id === product2Id);
    resetCompareState(product1Id);
    if (!product1 || !product2) return;
    const productsInfo = `المنتج الأول (الخاص بنا): \n- الاسم: ${product1.name || 'المنتج الأول'} \n- السعر: ${product1.price || 'غير محدد'}\n- التفاصيل: ${product1.details || 'لا يوجد'}\n\nالمنتج الثاني (الخاص بنا أيضاً):\n- الاسم: ${product2.name || 'المنتج الثاني'}\n- السعر: ${product2.price || 'غير محدد'}\n- التفاصيل: ${product2.details || 'لا يوجد'}`;
    generateAndShowCompare(productsInfo, `نقوم بتحليل <b>${product1.name}</b> و <b>${product2.name}</b>...`);
}

function promptCompetitorCompare(productId) {
    Swal.fire({
        title: '<i class="fas fa-search" style="color:#f59e0b;"></i> بيانات المنافس',
        html: `<p style="font-size:13px; color:#666; margin-bottom:15px; font-weight:bold;">يُفضل كتابة <span style="color:#1a73e8;">(الماركة + الكود)</span> لنتائج دقيقة جداً.<br>مثال: LG 55UQ75006LG</p><input id="swal-comp-input" class="swal2-input" placeholder="اكتب الماركة والكود ..." style="font-family: 'Cairo', sans-serif; direction: rtl;">`,
        showCancelButton: true, confirmButtonText: 'بدء المقارنة 🚀', cancelButtonText: 'إلغاء', confirmButtonColor: '#f59e0b',
        preConfirm: () => {
            const val = document.getElementById('swal-comp-input').value.trim();
            if (!val) Swal.showValidationMessage('لازم تكتب كود أو اسم المنتج المنافس يا بطل!');
            return val;
        }
    }).then((result) => {
        if (result.isConfirmed) executeCompetitorCompare(productId, result.value);
    });
}

function executeCompetitorCompare(productId, competitorName) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const productsInfo = `المنتج الأول (الخاص بنا - العربي):\n- الاسم: ${product.name || 'غير محدد'}\n- السعر: ${product.price || 'غير محدد'}\n- التفاصيل: ${product.details || 'لا يوجد'}\n\nالمنتج الثاني (المنافس الخارجي في السوق):\n- المُدخل من المستخدم (قد يكون كود موديل أو اسم): [ ${competitorName} ]\n\n**تعليمات حاسمة للذكاء الاصطناعي:**\n1. المُدخل أعلاه للمنتج الثاني غالباً هو "كود موديل فني" (Model Number).\n2. يجب عليك البحث في قاعدة بياناتك التقنية للتعرف على الماركة والمواصفات الفنية الدقيقة لهذا الكود قبل إجراء المقارنة.\n3. إذا تعرفت على الكود، اذكر اسم الماركة والموديل بوضوح في المقارنة.`;
    generateAndShowCompare(productsInfo, `بنحلل كود <b>${competitorName}</b> وبنقارنه مع <b>${product.name}</b>...`);
}

async function generateAndShowCompare(productsInfo, loadingMsg) {
    Swal.fire({
        title: '⚖️ جاري المقارنة الذكية...',
        html: `<div style="margin-top:10px;">${loadingMsg}</div><br><span style="font-size:11px; color:#888;">(الذكاء الاصطناعي بيبحث في المواصفات الفنية دلوقت...)</span>`,
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    let prompt = window.aiConfig.promptCompare;
    if (!prompt) { prompt = `أنت بياع مصري شاطر. اعمل مقارنة سريعة بين المنتجين:\n{products_data}\nأعطني النتيجة ككود HTML...`; }
    if (prompt.includes('{products_data}')) { prompt = prompt.replace('{products_data}', productsInfo); } else { prompt += '\n\nبيانات المنتجات للمقارنة:\n' + productsInfo; }

    try {
        let aiHtml = await window.fetchGeminiAPI(prompt);
        aiHtml = aiHtml.replace(/```html/gi, '').replace(/```/g, '').trim();
        Swal.fire({ title: '⚖️ نتيجة المقارنة', html: `<div class="ai-modal-content">${aiHtml}</div>`, width: '750px', confirmButtonText: '👍 تمام، فهمت', confirmButtonColor: '#1a73e8', customClass: { popup: 'ai-swal-popup' } });
    } catch (error) {
        Swal.fire({ title: '❌ عذراً، حدث خطأ', html: `<div style="text-align:right;"><b>السبب:</b> ${error.message}</div>`, icon: 'error', confirmButtonText: 'موافق' });
    }
}

window.aiPersuadeCustomer = async function(productId) {
    if (!window.aiConfig || !window.aiConfig.apiKey) { return Swal.fire('تنبيه', 'ميزة الذكاء الاصطناعي غير مفعلة. يرجى إضافة مفتاح API من لوحة التحكم أولاً.', 'warning'); }
    if (Swal.isVisible()) Swal.close();
    if (window.compareProductId) {
        const btn = document.getElementById(`btn-compare-${window.compareProductId}`);
        if (btn) { btn.innerHTML = '⚖️ قارن منتجين'; btn.style.background = 'linear-gradient(135deg, #3B82F6, #2563EB)'; }
        window.compareProductId = null;
    }
    const product = products.find(p => p.id === productId);
    if (!product) return;

    Swal.fire({ title: '✨ جاري تحليل المنتج...', html: 'المساعد الذكي يقوم بتجهيز خطة البيع الأنسب، يرجى الانتظار...', allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, didOpen: () => { Swal.showLoading(); }});

    const productInfo = `- اسم المنتج: ${product.name || 'غير محدد'}\n- السعر: ${product.price || 'غير محدد'}\n- القسم: ${product.category || 'غير محدد'}\n- التفاصيل: ${product.details || 'لا يوجد'}`;
    let prompt = window.aiConfig.promptConvince;
    if (!prompt) { prompt = `أنت بياع مصري شاطر. أقنع الزبون يشتري المنتج ده:\n{product_data}\nأعطني النتيجة ككود HTML...`; }
    if (prompt.includes('{product_data}')) { prompt = prompt.replace('{product_data}', productInfo); } else { prompt += '\n\nبيانات المنتج:\n' + productInfo; }

    try {
        let aiHtml = await window.fetchGeminiAPI(prompt);
        aiHtml = aiHtml.replace(/```html/gi, '').replace(/```/g, '').trim();
        Swal.fire({ title: '✨ خطة البيع الذكية', html: `<div class="ai-modal-content">${aiHtml}</div>`, width: '600px', confirmButtonText: '👍 جاهز للبيع', confirmButtonColor: '#1a73e8', customClass: { popup: 'ai-swal-popup' } });
    } catch (error) {
        Swal.fire({ title: '❌ عذراً، حدث خطأ', html: `<div style="text-align:right;"><b>السبب:</b> ${error.message}</div>`, icon: 'error', confirmButtonText: 'موافق' });
    }
};

function togglePasswordVisibility() {
    const passInput = document.getElementById('login-pass');
    const eyeIcon = document.getElementById('eye-icon');
    if (passInput.type === 'password') {
        passInput.type = 'text';
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path>';
    } else {
        passInput.type = 'password';
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
    }
}

window.showToolGuide = function(tool) {
    let guideData = {
        search: { title: "البحث الذكي", text: "يمكنك البحث بكود الموديل أو جزء من الاسم ويقوم بحفظ عمليات بحث قمت بها لتوفير وقتك.", icon: "info" },
        ai: { title: "مساعد الذكاء الاصطناعي", text: "اضغط على 'اقنع العميل' ليقوم AI بتحليل مواصفات المنتج وإنشاء نص بيعي مقنع. أو 'قارن منتجين' لعمل جدول مقارنة احترافي فوراً.", icon: "info" },
        sales: { title: "إدارة المبيعات", text: "سجل مبيعاتك اليومية من الزر العائم (📊). يمكنك حفظ المبيعات مؤقتاً عند ضعف الإنترنت، ثم رفعها جميعاً للسيرفر بضغطة واحدة.", icon: "success" },
        cust: { title: "نظام تذكير العملاء", text: "عند تسجيل بيانات عميل، يمكنك ضبط وقت تذكير. التطبيق سيرسل لك إشعاراً (🔔) في الموعد المحدد حتى لو كنت تتصفح منتجاً آخر.", icon: "info" }
    };
    const info = guideData[tool];
    Swal.fire({ title: info.title, text: info.text, icon: info.icon, confirmButtonText: "فهمت", confirmButtonColor: "#3b82f6", target: document.getElementById('tourModal') });
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('تم تسجيل Service Worker بنجاح بنطاق: ', registration.scope);
        }, function(err) { console.log('فشل تسجيل Service Worker: ', err); });
    });
}

window.handleModernColorClick = function(pid, src, element) {
    const colorWrapper = document.getElementById(`color-wrap-${pid}`);
    if (colorWrapper) { colorWrapper.querySelectorAll('.modern-swatch').forEach(el => el.classList.remove('active')); }
    element.classList.add('active');
    if (src && src !== 'undefined') { window.focusColor(pid, src); }
};

(function() {
    document.addEventListener("keyup", function (e) {
        if (e.key === "PrintScreen" || e.keyCode === 44) {
            navigator.clipboard.writeText('عذراً، غير مسموح بنسخ محتوى هذا التطبيق ©');
            document.body.style.opacity = '0';
            Swal.fire({ icon: 'error', title: 'تنبيه أمني', text: 'غير مسموح بأخذ لقطة شاشة لحماية حقوق الملكية!', confirmButtonText: 'حسناً' }).then(() => { document.body.style.opacity = '1'; });
        }
    });

    setInterval(function() {
        const before = new Date().getTime();
        debugger; 
        const after = new Date().getTime();
        if (after - before > 100) {
            document.body.innerHTML = "<h1 style='color:red; text-align:center; margin-top:20%;'>تم اكتشاف محاولة اختراق!</h1>";
            window.location.replace("https://www.google.com");
        }
    }, 1000);

    const css = document.createElement('style');
    css.innerHTML = `* { -webkit-user-select: none !important; -moz-user-select: none !important; -ms-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }`;
    document.head.appendChild(css);
})();

const edgeHandle = document.getElementById('edgeHandle');
const edgeSidebar = document.getElementById('edgeSidebar');

window.toggleEdgeSub = function(subId, btnElement) {
    document.querySelectorAll('.edge-sub-menu').forEach(menu => { if (menu.id !== subId) menu.classList.remove('open'); });
    document.querySelectorAll('.edge-item').forEach(item => { if (item !== btnElement) item.classList.remove('active'); });
    const targetMenu = document.getElementById(subId);
    if (targetMenu) { targetMenu.classList.toggle('open'); btnElement.classList.toggle('active'); }
};

window.closeEdgeSidebar = function() {
    if (edgeSidebar) edgeSidebar.classList.remove('open');
    document.querySelectorAll('.edge-sub-menu').forEach(menu => menu.classList.remove('open'));
    document.querySelectorAll('.edge-item').forEach(item => item.classList.remove('active'));
};

if (edgeHandle && edgeSidebar) {
    const savedEdgePos = localStorage.getItem('edge_sidebar_pos');
    if (savedEdgePos) {
        let topVal = parseInt(savedEdgePos);
        if (topVal > window.innerHeight - 80) topVal = window.innerHeight - 80;
        if (topVal < 80) topVal = 80;
        const safePos = topVal + 'px';
        edgeHandle.style.top = safePos;
        edgeSidebar.style.top = safePos;
    }

    let isDragging = false; let hasMoved = false; let startY = 0; let startX = 0; let startTop = 0;

    function startDrag(e) {
        isDragging = true; hasMoved = false;
        startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        startTop = edgeHandle.offsetTop; 
        edgeHandle.style.transition = 'none'; edgeSidebar.style.transition = 'none'; 
        const hintBox = document.getElementById('edge-smart-hint');
        if (hintBox) { hintBox.style.transition = 'none'; hintBox.classList.remove('show-hint'); edgeHandle.classList.remove('hint-active'); }
    }

    function doDrag(e) {
        if (!isDragging) return;
        let currentY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        let currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        let diffY = currentY - startY; let absY = Math.abs(diffY); let absX = Math.abs(currentX - startX);
        if (!hasMoved) { if (absX > 10 && absX > absY) { isDragging = false; return; } if (absY > 10) { hasMoved = true; } }
        if (hasMoved) {
            if (e.cancelable) e.preventDefault(); 
            let newTop = startTop + diffY;
            if (newTop < 80) newTop = 80; 
            if (newTop > window.innerHeight - 80) newTop = window.innerHeight - 80; 
            let newTopPx = newTop + 'px';
            edgeHandle.style.top = newTopPx; edgeSidebar.style.top = newTopPx;
            const hintBox = document.getElementById('edge-smart-hint');
            if (hintBox) hintBox.style.top = newTopPx;
        }
    }

    function endDrag(e) {
        isDragging = false;
        edgeHandle.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        edgeSidebar.style.transition = 'right 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
        const hintBox = document.getElementById('edge-smart-hint');
        if (hintBox) hintBox.style.transition = 'all 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
        if (hasMoved) {
            const finalTop = edgeHandle.style.top;
            if (finalTop) { localStorage.setItem('edge_sidebar_pos', finalTop); }
        }
    }

    edgeHandle.addEventListener('mousedown', startDrag); document.addEventListener('mousemove', doDrag); document.addEventListener('mouseup', endDrag);
    edgeHandle.addEventListener('touchstart', startDrag, { passive: false }); document.addEventListener('touchmove', doDrag, { passive: false }); document.addEventListener('touchend', endDrag);

    edgeHandle.addEventListener('click', function(e) {
        e.stopPropagation();
        if (hasMoved) { hasMoved = false; return; }
        edgeSidebar.classList.toggle('open');
        if (!edgeSidebar.classList.contains('open')) closeEdgeSidebar(); 
    });

    document.addEventListener('click', function(e) {
        if (!edgeSidebar.contains(e.target) && !edgeHandle.contains(e.target)) { closeEdgeSidebar(); }
    });
}

window.triggerEdgeMenuHint = function() {
    const lockScreen = document.getElementById('app-lock-screen');
    if (lockScreen && lockScreen.style.display === 'flex') return;
    if (localStorage.getItem('edge_hint_seen') === 'true') return;
    const handle = document.getElementById('edgeHandle');
    if (!handle) return;
    let hintBox = document.getElementById('edge-smart-hint');
    if (!hintBox) {
        hintBox = document.createElement('div');
        hintBox.id = 'edge-smart-hint';
        hintBox.className = 'edge-hint-tooltip';
        hintBox.innerHTML = `<span>اطلع على قائمه الادوات من هنا</span> <i class="fa-solid fa-arrow-right fa-beat-fade" style="font-size:10px;"></i>`;
        const savedEdgePos = localStorage.getItem('edge_sidebar_pos');
        if (savedEdgePos) { hintBox.style.top = savedEdgePos; }
        document.body.appendChild(hintBox);
    }
    setTimeout(() => {
        hintBox.classList.add('show-hint');
        handle.classList.add('hint-active');
        localStorage.setItem('edge_hint_seen', 'true');
        setTimeout(() => { hintBox.classList.remove('show-hint'); handle.classList.remove('hint-active'); }, 3000);
    }, 2000); 
};

document.addEventListener("DOMContentLoaded", () => {
    const savedDocId = localStorage.getItem('seller_doc_id'); 
    if (savedDocId) { triggerEdgeMenuHint(); }
});
//]]>
