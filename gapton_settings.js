window.VTPSettings = {
    defaultPrefixes: ['SHOPEE', 'VTP', 'PKE', 'KMS', 'PSL', 'TPO'],
    getPrefixes: function() {
        let saved = localStorage.getItem('vtp_custom_prefixes');
        if (saved) return JSON.parse(saved);
        return this.defaultPrefixes;
    },
    savePrefixes: function(prefixes) {
        localStorage.setItem('vtp_custom_prefixes', JSON.stringify(prefixes));
    },
    addPrefix: function(prefix) {
        prefix = prefix.toUpperCase().trim();
        if (!prefix) return false;
        let current = this.getPrefixes();
        if (!current.includes(prefix)) {
            current.push(prefix);
            this.savePrefixes(current);
            return true;
        }
        return false;
    },
    removePrefix: function(prefix) {
        let current = this.getPrefixes();
        let updated = current.filter(p => p !== prefix);
        this.savePrefixes(updated);
    }
};