document.addEventListener('DOMContentLoaded', function() {

    // ===== Product table filtering (retailer detail page) =====
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
        const categorySelect = document.getElementById('filter-category');
        const brandSelect = document.getElementById('filter-brand');
        const nutriscoreSelect = document.getElementById('filter-nutriscore');
        const bonusSelect = document.getElementById('filter-bonus');

        const filters = [searchInput, categorySelect, brandSelect, nutriscoreSelect, bonusSelect];
        filters.forEach(el => {
            if (el) {
                el.addEventListener('input', applyProductFilters);
                el.addEventListener('change', applyProductFilters);
            }
        });

        function applyProductFilters() {
            const search = searchInput.value.toLowerCase();
            const category = categorySelect ? categorySelect.value : '';
            const brand = brandSelect ? brandSelect.value : '';
            const nutriscore = nutriscoreSelect ? nutriscoreSelect.value : '';
            const bonus = bonusSelect ? bonusSelect.value : '';

            const rows = document.querySelectorAll('.product-table tbody tr');
            let visible = 0;

            rows.forEach(row => {
                const show =
                    (!search || (row.dataset.title && row.dataset.title.includes(search))) &&
                    (!category || row.dataset.category === category) &&
                    (!brand || row.dataset.brand === brand) &&
                    (!nutriscore || row.dataset.nutriscore === nutriscore) &&
                    (!bonus || row.dataset.bonus === bonus);

                row.style.display = show ? '' : 'none';
                if (show) visible++;
            });

            const counter = document.getElementById('product-count');
            if (counter) counter.textContent = visible;
        }

        // Column sorting
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', function() {
                const sortKey = this.dataset.sort;
                const tbody = document.querySelector('.product-table tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));

                const isAsc = this.classList.toggle('sort-asc');
                document.querySelectorAll('.sortable').forEach(h => {
                    if (h !== this) h.classList.remove('sort-asc');
                });

                rows.sort((a, b) => {
                    let va = a.dataset[sortKey] || '';
                    let vb = b.dataset[sortKey] || '';
                    if (sortKey === 'price') {
                        va = parseFloat(va) || 0;
                        vb = parseFloat(vb) || 0;
                        return isAsc ? va - vb : vb - va;
                    }
                    return isAsc ? va.localeCompare(vb) : vb.localeCompare(va);
                });

                rows.forEach(row => tbody.appendChild(row));
            });
        });
    }
});

// Timeline filter (called from inline onchange)
function applyTimelineFilters() {
    const retailer = document.getElementById('timeline-retailer');
    const type = document.getElementById('timeline-type');
    if (!retailer && !type) return;

    const params = new URLSearchParams();
    if (retailer && retailer.value) params.set('retailer', retailer.value);
    if (type && type.value) params.set('type', type.value);

    const qs = params.toString();
    location.href = location.pathname + (qs ? '?' + qs : '');
}
