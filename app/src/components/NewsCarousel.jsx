import React, { useState, useRef } from 'react';

export default function NewsCarousel({ news }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef(null);

  const scrollToSlide = (index) => {
    if (carouselRef.current && news.length > 0) {
      const slideWidth = carouselRef.current.children[0].offsetWidth + 12;
      carouselRef.current.scrollLeft = slideWidth * index;
      setActiveIndex(index);
    }
  };

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">
          <span className="section-icon"><svg className="ekko-icon" width="20" height="20" aria-hidden="true"><use href="/assets/icons/ui-icons.svg#news" /></svg></span>
          Tin tức
        </div>
        <button className="view-all-btn">See more</button>
      </div>

      <div className="news-carousel-wrapper">
        <div className="news-carousel" ref={carouselRef}>
          {news.map((article) => (
            <div key={article.id} className="news-card">
              <img src={article.image} alt={article.title} className="news-image" />
              <div className="news-content">
                <div className="news-category">{article.category}</div>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <span className="news-time">{article.readTime} read</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dots indicator */}
      <div className="carousel-dots">
        {news.map((_, i) => (
          <button
            key={i}
            className={`dot ${i === activeIndex ? 'active' : ''}`}
            onClick={() => scrollToSlide(i)}
          ></button>
        ))}
      </div>
    </div>
  );
}
