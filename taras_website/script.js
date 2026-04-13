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
    document.querySelector('#features').scrollIntoView({
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
    
    // Create mailto link
    const mailtoLink = `mailto:oykubozdag35@hotmail.com?subject=TARAS Kontakt İsteği - ${encodeURIComponent(name)}&body=${encodeURIComponent(`İsim: ${name}\nE-mail: ${email}\n\nMesaj:\n${message}`)}`;
    
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
    const query = prompt('Ne aramak istiyorsunuz?');
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
    
    // Navbar color on scroll
    if (window.scrollY > 50) {
        navbar.style.background = '#0f2608';
    } else {
        navbar.style.background = '#1a3d0a';
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
