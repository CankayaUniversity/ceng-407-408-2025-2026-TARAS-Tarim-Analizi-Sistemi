// Theme Toggle System
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = themeToggle?.querySelector('.sun-icon');
const moonIcon = themeToggle?.querySelector('.moon-icon');

// Initialize theme from localStorage or system preference
let currentTheme = localStorage.getItem('selectedTheme') 
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

// Function to change theme
function changeTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('selectedTheme', theme);
    
    // Update HTML data-theme attribute
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update icon visibility
    if (theme === 'dark') {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    }
}

// Theme toggle button click handler
themeToggle?.addEventListener('click', () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    changeTheme(newTheme);
});

// Initialize theme on page load
changeTheme(currentTheme);

// Language Toggle System

const langToggle = document.querySelector('.lang-toggle');
const htmlElement = document.documentElement;

// Initialize language from localStorage or default to Turkish
let currentLang = localStorage.getItem('selectedLang') || 'tr';

// Function to change language
function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('selectedLang', lang);
    
    // Update HTML lang attribute and data-lang
    htmlElement.lang = lang;
    htmlElement.setAttribute('data-lang', lang);
    
    // Update all elements with data-tr and data-en attributes
    document.querySelectorAll('[data-tr][data-en]').forEach(element => {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            if (element.hasAttribute('data-placeholder-tr') && element.hasAttribute('data-placeholder-en')) {
                element.placeholder = lang === 'tr' ? element.getAttribute('data-placeholder-tr') : element.getAttribute('data-placeholder-en');
            }
        } else {
            element.textContent = lang === 'tr' ? element.getAttribute('data-tr') : element.getAttribute('data-en');
        }
    });
    
    // Update language button text
    const buttonText = lang === 'tr' ? 'ENG' : 'TR';
    langToggle.textContent = buttonText;
    
    // Update search prompt based on language
    const searchPrompts = {
        'tr': 'Ne aramak istiyorsunuz?',
        'en': 'What do you want to search for?'
    };
}

// Language toggle button click handler
langToggle?.addEventListener('click', () => {
    const newLang = currentLang === 'tr' ? 'en' : 'tr';
    changeLanguage(newLang);
});

// Initialize language on page load
changeLanguage(currentLang);

// Mobile Menu Toggle

const hamburger = document.querySelector('.hamburger');
const navbarMenu = document.querySelector('.navbar-menu');

hamburger?.addEventListener('click', () => {
    navbarMenu.classList.toggle('active');
});

// Close menu when a link is clicked
document.querySelectorAll('.navbar-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navbarMenu.classList.remove('active');
    });
});

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Explore Button Click Handler
const exploreBtn = document.querySelector('.explore-btn');
exploreBtn?.addEventListener('click', () => {
    document.querySelector('#how-taras-works').scrollIntoView({
        behavior: 'smooth'
    });
});

// Contact Form Submission
const contactForm = document.querySelector('.contact-form');
contactForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = contactForm.querySelector('input[name="name"]').value;
    const email = contactForm.querySelector('input[name="email"]').value;
    const message = contactForm.querySelector('textarea[name="message"]').value;
    
    // Create mailto link with proper language-specific labels
    const labels = {
        'tr': { name: 'İsim', email: 'E-mail', message: 'Mesaj' },
        'en': { name: 'Name', email: 'Email', message: 'Message' }
    };
    
    const lang = currentLang;
    const mailSubject = lang === 'tr' ? `TARAS Kontakt İsteği - ${name}` : `TARAS Contact Request - ${name}`;
    const mailBody = `${labels[lang].name}: ${name}\n${labels[lang].email}: ${email}\n\n${labels[lang].message}:\n${message}`;
    
    const mailtoLink = `mailto:oykubozdag35@hotmail.com?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
    
    // Open mail client
    window.location.href = mailtoLink;
    
    // Reset form
    contactForm.reset();
});

// Scroll Animation for Cards
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe feature cards, tech items, and team members
document.querySelectorAll('.feature-card, .tech-item, .team-member').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});

// Search Icon Click
const searchIcon = document.querySelector('.search-icon');
searchIcon?.addEventListener('click', () => {
    const searchPrompts = {
        'tr': 'Ne aramak istiyorsunuz?',
        'en': 'What do you want to search for?'
    };
    const query = prompt(searchPrompts[currentLang]);
    if (query) {
        console.log('Arama yapılıyor:', query);
        // You can implement actual search functionality here
    }
});

// Parallax Effect for Hero Background
const heroBackground = document.querySelector('.hero-background');
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    const heroSection = document.querySelector('.hero');
    
    // Navbar scroll state
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
    
    // Parallax for hero background - only when in hero section
    if (heroBackground && window.scrollY < window.innerHeight) {
        const scrollPosition = window.scrollY;
        heroBackground.style.transform = `translateY(${scrollPosition * 0.5}px)`;
    }
});

// Add loading animation when page loads
window.addEventListener('load', () => {
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
        heroTitle.style.animation = 'fadeInUp 1s ease-out';
    }
});

// Prevent right-click on images (optional anti-piracy measure)
document.querySelectorAll('.hero-background').forEach(img => {
    img.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
});

console.log('TARAS Website Loaded Successfully!');
