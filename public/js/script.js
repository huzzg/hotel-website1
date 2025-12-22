// ===== Chatbot Toggle =====
function toggleChatbot() {
  const chatbotBody = document.getElementById('chatbot-body');
  chatbotBody.style.display = chatbotBody.style.display === 'none' ? 'block' : 'none';
}

function sendMessage() {
  const input = document.getElementById('chat-input').value;
  const output = document.getElementById('chat-output');
  if (input.trim()) {
    output.innerHTML += `<p class="text-primary"><strong>Bạn:</strong> ${input}</p>`;
    let response = 'Xin lỗi, tôi không hiểu. Hãy thử hỏi về phòng hoặc dịch vụ khách sạn!';
    if (input.toLowerCase().includes('room')) response = 'Chúng tôi có phòng Deluxe giá $150/đêm tại Đà Nẵng. Hãy đặt ngay!';
    if (input.toLowerCase().includes('check-in')) response = 'Vui lòng cung cấp ngày check-in để chúng tôi hỗ trợ!';
    output.innerHTML += `<p class="text-success"><strong>Bot:</strong> ${response}</p>`;
    output.scrollTop = output.scrollHeight;
    document.getElementById('chat-input').value = '';
  }
}

// ===== Hiệu ứng zoom ảnh =====
document.querySelectorAll('.room-card img').forEach(img => {
  img.addEventListener('mouseover', () => img.style.transform = 'scale(1.05)');
  img.addEventListener('mouseout', () => img.style.transform = 'scale(1)');
});

// ===== Swiper ƯU ĐÃI =====
document.addEventListener('DOMContentLoaded', () => {
  // Khởi tạo Swiper 1 lần duy nhất
  const discountSwiper = new Swiper('.discount-swiper', {
    slidesPerView: 3,
    spaceBetween: 30,
    grabCursor: true,
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
    breakpoints: {
      0: { slidesPerView: 1 },
      768: { slidesPerView: 2 },
      1024: { slidesPerView: 3 },
    },
  });
});

// ===== Mở rộng/thu gọn loại phòng =====
document.querySelectorAll('.room-type-card').forEach(card => {
  const header = card.querySelector('.room-type-header');
  header.addEventListener('click', () => {
    document.querySelectorAll('.room-type-card').forEach(c => {
      if (c !== card) c.classList.remove('active');
    });
    card.classList.toggle('active');
  });
});

// ===== Hình ảnh và nút "Xem tất cả phòng" =====
document.addEventListener('DOMContentLoaded', () => {
  const roomImages = {
    standard: '/images/standard.jpg',
    superior: '/images/superior.jpg',
    deluxe: '/images/deluxe.jpg',
    suite: '/images/suite.jpg'
  };

  const img = document.getElementById('roomImage');
  const viewAllContainer = document.getElementById('viewAllContainer');
  const viewAllButton = document.getElementById('viewAllButton');

  document.querySelectorAll('.room-type-card').forEach(card => {
    const header = card.querySelector('.room-type-header');
    header.addEventListener('click', () => {
      document.querySelectorAll('.room-type-card').forEach(c => {
        if (c !== card) c.classList.remove('active');
      });
      card.classList.toggle('active');

      const type = card.dataset.type;
      const typeName = type.charAt(0).toUpperCase() + type.slice(1);

      if (img && roomImages[type]) {
        img.classList.remove('hidden');
        img.classList.add('visible');
        img.style.opacity = 0;
        setTimeout(() => {
          img.src = roomImages[type];
          img.style.opacity = 1;
        }, 200);
      }

      if (viewAllContainer && viewAllButton) {
        viewAllContainer.classList.remove('hidden');
        viewAllContainer.classList.add('visible');
        viewAllButton.href = `/search?type=${type}`;
        viewAllButton.textContent = `Xem tất cả phòng ${typeName} →`;
      }
    });
  });
});

// ===== Sao chép mã giảm giá =====
function copyCode(code) {
  navigator.clipboard.writeText(code);
  alert('Đã sao chép mã: ' + code);
}
