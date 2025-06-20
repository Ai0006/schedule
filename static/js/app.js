document.addEventListener('DOMContentLoaded', () => {
    const reservationForm = document.getElementById('reservation-form');
    const messageArea = document.getElementById('message-area');
    const purposeInput = document.getElementById('purpose');
    const gradeField = document.getElementById('grade-field');
    const calendarEl = document.getElementById('interactive-calendar');

    const confirmationArea = document.getElementById('confirmation-area');
    const confirmationDetails = document.getElementById('confirmation-details');
    const confirmReservationButton = document.getElementById('confirm-reservation');
    const cancelConfirmationButton = document.getElementById('cancel-confirmation');

    // Park name elements
    const parkNameSelect = document.getElementById('park_name_select');
    const parkNameOtherInput = document.getElementById('park_name_other');

    let currentReservationData = null; // 確認中の予約データを保持
    let calendar = null; // FullCalendar instance

    // メッセージ表示関数
    function showUserMessage(message, type) { // Renamed to avoid conflict if admin_app.js is ever merged/used on same page
        messageArea.textContent = message;
        messageArea.className = ''; // Reset classes
        messageArea.classList.add(type); // 'success', 'error', or 'info'
    }
    function clearUserMessage() {
        messageArea.textContent = '';
        messageArea.className = '';
    }

    // 日時フォーマット関数 (例: YYYY-MM-DDTHH:mm -> YYYY年MM月DD日 HH時mm分)
    function formatDisplayDateTime(dateTimeStr) {
        if (!dateTimeStr) return '未設定';
        try {
            const date = new Date(dateTimeStr);
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${year}年${month}月${day}日 ${hours}時${minutes}分`;
        } catch (e) {
            return dateTimeStr;
        }
    }

    // Load Parks into Dropdown
    async function loadParksDropdown() {
        if (!parkNameSelect) return;
        try {
            const response = await fetch('/api/parks');
            if (!response.ok) {
                throw new Error('公園リストの読み込みに失敗しました。');
            }
            const parks = await response.json();
            parks.forEach(park => {
                const option = document.createElement('option');
                option.value = park.name;
                option.textContent = park.name;
                parkNameSelect.appendChild(option);
            });
            const otherOption = document.createElement('option');
            otherOption.value = 'other';
            otherOption.textContent = 'その他（自由入力）';
            parkNameSelect.appendChild(otherOption);
        } catch (error) {
            console.error('Error loading parks for dropdown:', error);
            showUserMessage(error.message, 'error');
        }
    }

    if (parkNameSelect && parkNameOtherInput) {
        parkNameSelect.addEventListener('change', () => {
            if (parkNameSelect.value === 'other') {
                parkNameOtherInput.style.display = 'inline-block';
                parkNameOtherInput.focus();
            } else {
                parkNameOtherInput.style.display = 'none';
                parkNameOtherInput.value = ''; // Clear if hidden
            }
        });
    }


    // FullCalendarの初期化
    if (calendarEl) {
        calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'ja',
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek' // Added listWeek
            },
            events: async function(fetchInfo, successCallback, failureCallback) {
                try {
                    const response = await fetch('/api/reservations');
                    if (!response.ok) {
                        failureCallback(new Error('予約情報の取得に失敗しました。'));
                        return;
                    }
                    const reservations = await response.json();
                    const events = reservations.map(reservation => ({
                        id: reservation.id,
                        title: `${reservation.organization_name} @ ${reservation.park_name}` + (reservation.is_exclusive ? ' (占用)' : ''),
                        start: reservation.start_datetime,
                        end: reservation.end_datetime,
                        backgroundColor: reservation.is_exclusive ? '#dc3545' : (reservation.status === 'pending' ? '#ffc107' : '#007bff'), // Pending is yellow
                        borderColor: reservation.is_exclusive ? '#dc3545' : (reservation.status === 'pending' ? '#ffc107' : '#007bff'),
                        extendedProps: {
                            status: reservation.status,
                            purpose: reservation.purpose,
                            park_name: reservation.park_name
                        }
                    }));
                    successCallback(events);
                } catch (error) {
                    console.error('Error fetching reservations for calendar:', error);
                    failureCallback(error);
                }
            },
            dateClick: function(info) {
                const startDateTimeField = document.getElementById('start_datetime');
                const now = new Date();
                const clickedDate = new Date(info.dateStr);
                // Set default time to 09:00 for future dates, or current time if today
                let hours = 9;
                let minutes = 0;
                if (clickedDate.toDateString() === now.toDateString() && now.getHours() >= hours) {
                     hours = now.getHours();
                     minutes = now.getMinutes();
                }
                const formattedHours = hours.toString().padStart(2, '0');
                const formattedMinutes = minutes.toString().padStart(2, '0');

                startDateTimeField.value = `${info.dateStr}T${formattedHours}:${formattedMinutes}`;
                document.getElementById('end_datetime').value = ''; // Clear end datetime
                parkNameSelect.focus(); // Focus on park name after date click
            },
            eventClick: async function(info) {
                const reservationId = info.event.id;
                const reservationTitle = info.event.title;
                // Show more details on click instead of confirm cancel
                alert(`予約詳細:\nタイトル: ${reservationTitle}\n目的: ${info.event.extendedProps.purpose}\nステータス: ${info.event.extendedProps.status}\n公園: ${info.event.extendedProps.park_name}`);

                // If you want to keep cancel functionality:
                /*
                if (confirm(`予約「${reservationTitle}」をキャンセルしますか？\n注意: この操作は管理者によって確認される必要があります。\n（現在この操作はデモ用であり、実際にはキャンセル処理は行われません）`)) {
                    // Placeholder for actual cancel API call
                    // showUserMessage('キャンセルリクエストは現在サポートされていません。管理者にお問い合わせください。', 'info');
                }
                */
            }
        });
        calendar.render();
    }


    // 学年フィールドの表示制御
    if (purposeInput && gradeField) {
        purposeInput.addEventListener('input', () => {
            const purposeValue = purposeInput.value.toLowerCase();
            if (purposeValue.includes('遠足') || purposeValue.includes('校外学習')) {
                gradeField.style.display = 'block';
            } else {
                gradeField.style.display = 'none';
                document.getElementById('grade').value = ''; // Clear if hidden
            }
        });
    }

    // 予約フォームの「内容確認へ」ボタンの処理
    if (reservationForm) {
        reservationForm.addEventListener('submit', (event) => {
            event.preventDefault();
            clearUserMessage();

            const formData = new FormData(reservationForm);
            currentReservationData = Object.fromEntries(formData.entries());

            // Park name handling
            let parkName = '';
            if (parkNameSelect.value === 'other') {
                parkName = parkNameOtherInput.value.trim();
            } else {
                parkName = parkNameSelect.value;
            }

            if (!parkName) {
                showUserMessage('公園名を選択または入力してください。', 'error');
                parkNameSelect.focus();
                return;
            }
            currentReservationData.park_name = parkName; // Add to data to be submitted
            // Remove select and other input from submission data if they exist
            delete currentReservationData.park_name_select;
            delete currentReservationData.park_name_other;


            // Type conversion and validation
            currentReservationData.is_exclusive = parseInt(currentReservationData.is_exclusive, 10);
            currentReservationData.number_of_people = parseInt(currentReservationData.number_of_people, 10);
            if (gradeField.style.display === 'none' || !currentReservationData.grade) {
                currentReservationData.grade = null;
            }

            if (!currentReservationData.start_datetime || !currentReservationData.end_datetime ||
                new Date(currentReservationData.start_datetime) >= new Date(currentReservationData.end_datetime)) {
                showUserMessage('開始日時と終了日時を正しく入力してください。終了日時は開始日時より後である必要があります。', 'error');
                return;
            }

            // 確認詳細の表示
            confirmationDetails.innerHTML = `
                <p><strong>公園名:</strong> <span id="confirm-park-name">${currentReservationData.park_name}</span></p>
                <p><strong>利用開始日時:</strong> ${formatDisplayDateTime(currentReservationData.start_datetime)}</p>
                <p><strong>利用終了日時:</strong> ${formatDisplayDateTime(currentReservationData.end_datetime)}</p>
                <p><strong>占用利用:</strong> ${currentReservationData.is_exclusive === 1 ? 'あり' : 'なし'}</p>
                <p><strong>利用目的:</strong> ${currentReservationData.purpose}</p>
                <p><strong>お名前(団体名):</strong> ${currentReservationData.organization_name}</p>
                ${currentReservationData.grade ? `<p><strong>学年:</strong> ${currentReservationData.grade}</p>` : ''}
                <p><strong>人数:</strong> ${currentReservationData.number_of_people} 人</p>
                <p><strong>連絡先:</strong> ${currentReservationData.contact_info}</p>
            `;

            reservationForm.style.display = 'none';
            confirmationArea.style.display = 'block';
        });
    }


    // 予約確定処理
    if (confirmReservationButton) {
        confirmReservationButton.addEventListener('click', async () => {
            if (!currentReservationData) return;

            try {
                const response = await fetch('/api/reservations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentReservationData),
                });
                const result = await response.json();
                if (response.ok && result.success !== false) { // Check for explicit failure from API
                    showUserMessage(result.message || '予約が正常に作成されました。ステータスは「申請中」です。', 'success');
                    reservationForm.reset();
                    parkNameOtherInput.style.display = 'none'; // Reset other park name field
                    gradeField.style.display = 'none';
                    if(calendar) calendar.refetchEvents();
                } else {
                    showUserMessage(result.message || result.error || '予約の作成に失敗しました。入力内容を確認してください。', 'error');
                }
            } catch (error) {
                console.error('Error submitting reservation:', error);
                showUserMessage('予約処理中にエラーが発生しました。', 'error');
            } finally {
                confirmationArea.style.display = 'none';
                reservationForm.style.display = 'block';
                currentReservationData = null;
            }
        });
    }

    // 修正処理
    if (cancelConfirmationButton) {
        cancelConfirmationButton.addEventListener('click', () => {
            confirmationArea.style.display = 'none';
            reservationForm.style.display = 'block';
            currentReservationData = null;
            showUserMessage('入力内容を修正してください。', 'info');
        });
    }

    // Initial loads
    loadParksDropdown();

});
