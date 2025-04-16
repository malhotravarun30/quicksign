document.addEventListener("DOMContentLoaded", () => {
  // Initialize Bootstrap tooltips and components
  try {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    if (tooltipTriggerList.length > 0 && typeof bootstrap !== "undefined") {
      const tooltipList = [...tooltipTriggerList].map((tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl))
    }
  } catch (e) {
    console.warn("Bootstrap tooltip initialization failed:", e)
  }

  // Get modal elements and create instances
  let saveSignatureModal, confirmationModal, notificationToast

  try {
    const saveSignatureModalEl = document.getElementById("saveSignatureModal")
    const confirmationModalEl = document.getElementById("confirmationModal")
    const notificationToastEl = document.getElementById("notificationToast")

    if (typeof bootstrap !== "undefined") {
      if (saveSignatureModalEl) {
        saveSignatureModal = new bootstrap.Modal(saveSignatureModalEl)
      }

      if (confirmationModalEl) {
        confirmationModal = new bootstrap.Modal(confirmationModalEl)
      }

      if (notificationToastEl) {
        notificationToast = new bootstrap.Toast(notificationToastEl)
      }
    }
  } catch (e) {
    console.warn("Bootstrap component initialization failed:", e)
  }

  // Canvas setup
  const canvas = document.getElementById("signatureCanvas")
  if (!canvas) {
    console.error("Canvas element not found")
    return
  }

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    console.error("Could not get canvas context")
    return
  }

  const canvasMessage = document.getElementById("canvasMessage")

  // Drawing state variables - MOVED UP before they're used
  let isDrawing = false
  let lastX = 0
  let lastY = 0
  let drawingHistory = []
  let currentStep = -1
  let currentTool = "pen"
  let hasDrawnSomething = false

  // Set canvas size
  function resizeCanvas() {
    const container = document.querySelector(".canvas-container")
    if (!container) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    // Set canvas size to 90% of container size, with a max width
    const canvasWidth = Math.min(containerWidth * 0.9, 800)
    const canvasHeight = Math.min(containerHeight * 0.9, 300)

    canvas.width = canvasWidth
    canvas.height = canvasHeight

    // Redraw canvas content if needed
    if (drawingHistory.length > 0 && currentStep >= 0) {
      ctx.putImageData(drawingHistory[currentStep], 0, 0)
    } else {
      // Set initial canvas background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // Update grid if enabled
    updateGrid()
  }

  // Tool elements
  const colorPicker = document.getElementById("colorPicker")
  const canvasColor = document.getElementById("canvasColor")
  const lineWidthInput = document.getElementById("lineWidth")
  const lineWidthValue = document.getElementById("lineWidthValue")
  const showGridCheckbox = document.getElementById("showGrid")
  const penTool = document.getElementById("penTool")
  const brushTool = document.getElementById("brushTool")
  const eraserTool = document.getElementById("eraserTool")
  const undoButton = document.getElementById("undoButton")
  const redoButton = document.getElementById("redoButton")

  // Action buttons
  const clearButton = document.getElementById("clearButton")
  const saveButton = document.getElementById("saveButton")
  const exportPNG = document.getElementById("exportPNG")
  const exportJPG = document.getElementById("exportJPG")
  const exportPDF = document.getElementById("exportPDF")
  const copyToClipboard = document.getElementById("copyToClipboard")

  // Modal elements
  const signatureName = document.getElementById("signatureName")
  const signaturePreview = document.getElementById("signaturePreview")
  const confirmSaveButton = document.getElementById("confirmSaveButton")
  const confirmActionButton = document.getElementById("confirmActionButton")
  const confirmationMessage = document.getElementById("confirmationMessage")

  // Toast notification
  const toastTitle = document.getElementById("toastTitle")
  const toastMessage = document.getElementById("toastMessage")

  // Initialize drawing settings
  ctx.strokeStyle = colorPicker ? colorPicker.value : "#000000"
  ctx.lineWidth = lineWidthInput ? Number.parseInt(lineWidthInput.value) : 3
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  // Fill canvas with initial background
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Initial canvas setup
  resizeCanvas()
  window.addEventListener("resize", resizeCanvas)

  // Save initial canvas state
  saveDrawingState()

  // Update line width display
  if (lineWidthValue && lineWidthInput) {
    lineWidthValue.textContent = `${lineWidthInput.value}px`
  }

  // Drawing functions
  function startDrawing(e) {
    isDrawing = true
    const { offsetX, offsetY } = getCoordinates(e)
    lastX = offsetX
    lastY = offsetY

    // For brush tool, draw a dot at the starting point
    if (currentTool === "brush") {
      ctx.beginPath()
      ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Hide canvas message when drawing starts
    if (!hasDrawnSomething && canvasMessage) {
      canvasMessage.style.opacity = "0"
      hasDrawnSomething = true
    }
  }

  function draw(e) {
    if (!isDrawing) return

    const { offsetX, offsetY } = getCoordinates(e)

    ctx.beginPath()
    ctx.moveTo(lastX, lastY)

    if (currentTool === "eraser") {
      // Save current context settings
      const currentColor = ctx.strokeStyle
      const currentLineWidth = ctx.lineWidth

      // Set eraser properties
      ctx.strokeStyle = canvasColor ? canvasColor.value : "#ffffff"
      ctx.lineWidth = currentLineWidth * 2 // Make eraser slightly larger

      // Draw eraser stroke
      ctx.lineTo(offsetX, offsetY)
      ctx.stroke()

      // Restore original settings
      ctx.strokeStyle = currentColor
      ctx.lineWidth = currentLineWidth
    } else if (currentTool === "brush") {
      // For brush tool, create a smoother line with quadratic curves
      ctx.quadraticCurveTo(lastX, lastY, (offsetX + lastX) / 2, (offsetY + lastY) / 2)
      ctx.stroke()
    } else {
      // Regular pen tool
      ctx.lineTo(offsetX, offsetY)
      ctx.stroke()
    }

    lastX = offsetX
    lastY = offsetY
  }

  function stopDrawing() {
    if (isDrawing) {
      isDrawing = false
      saveDrawingState()
    }
  }

  // Get coordinates for both mouse and touch events
  function getCoordinates(e) {
    let offsetX, offsetY

    if (e.type.includes("touch")) {
      const rect = canvas.getBoundingClientRect()
      const touch = e.touches[0] || e.changedTouches[0]
      offsetX = touch.clientX - rect.left
      offsetY = touch.clientY - rect.top
    } else {
      offsetX = e.offsetX
      offsetY = e.offsetY
    }

    return { offsetX, offsetY }
  }

  // Save current drawing state to history
  function saveDrawingState() {
    // Remove any states after the current step if we've gone back in history
    if (currentStep < drawingHistory.length - 1) {
      drawingHistory = drawingHistory.slice(0, currentStep + 1)
    }

    // Add current state to history
    drawingHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    currentStep++

    // Update undo/redo buttons
    updateHistoryButtons()
  }

  // Update undo/redo buttons state
  function updateHistoryButtons() {
    if (undoButton) undoButton.disabled = currentStep <= 0
    if (redoButton) redoButton.disabled = currentStep >= drawingHistory.length - 1
  }

  // Undo last action
  function undo() {
    if (currentStep > 0) {
      currentStep--
      ctx.putImageData(drawingHistory[currentStep], 0, 0)
      updateHistoryButtons()
    }
  }

  // Redo last undone action
  function redo() {
    if (currentStep < drawingHistory.length - 1) {
      currentStep++
      ctx.putImageData(drawingHistory[currentStep], 0, 0)
      updateHistoryButtons()
    }
  }

  // Clear canvas
  function clearCanvas() {
    if (confirmationModal) {
      confirmationModal.show()
      if (confirmationMessage) {
        confirmationMessage.textContent = "Are you sure you want to clear the canvas? This action cannot be undone."
      }

      if (confirmActionButton) {
        confirmActionButton.onclick = () => {
          ctx.fillStyle = canvasColor ? canvasColor.value : "#ffffff"
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          // Reset drawing state
          saveDrawingState()
          hasDrawnSomething = false
          if (canvasMessage) canvasMessage.style.opacity = "0.7"

          confirmationModal.hide()
          showNotification("Canvas Cleared", "The canvas has been cleared successfully.")
        }
      }
    } else {
      // If modal isn't available, just clear
      ctx.fillStyle = canvasColor ? canvasColor.value : "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      saveDrawingState()
      hasDrawnSomething = false
      if (canvasMessage) canvasMessage.style.opacity = "0.7"
    }
  }

  // Update grid display
  function updateGrid() {
    // Remove existing grid
    const existingGrid = document.querySelector(".canvas-grid")
    if (existingGrid) {
      existingGrid.remove()
    }

    if (showGridCheckbox && showGridCheckbox.checked) {
      const container = document.querySelector(".canvas-container")
      if (container) {
        const grid = document.createElement("div")
        grid.className = "canvas-grid"
        container.appendChild(grid)
      }
    }
  }

  // Change active tool
  function setActiveTool(tool) {
    currentTool = tool

    // Remove active class from all tool buttons
    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.classList.remove("active")
    })

    // Add active class to selected tool
    const toolButton = document.getElementById(`${tool}Tool`)
    if (toolButton) toolButton.classList.add("active")

    // Change cursor based on tool
    if (tool === "eraser") {
      canvas.style.cursor =
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 20H7L3 16c-1.5-1.5-1.5-3.5 0-5l7-7c1.5-1.5 3.5-1.5 5 0l5 5c1.5 1.5 1.5 3.5 0 5l-4 4'/%3E%3C/svg%3E\") 0 24, auto"
    } else {
      canvas.style.cursor = "crosshair"
    }
  }

  // Save signature
  function saveSignature() {
    if (!saveSignatureModal) {
      // Fallback if modal isn't available
      const dataUrl = canvas.toDataURL()
      const name = `Signature ${new Date().toLocaleString()}`

      // Save to localStorage
      const savedSignatures = JSON.parse(localStorage.getItem("savedSignatures") || "[]")
      savedSignatures.push({
        name: name,
        dataUrl: dataUrl,
        date: new Date().toISOString(),
      })

      localStorage.setItem("savedSignatures", JSON.stringify(savedSignatures))
      loadSavedSignatures()
      showNotification("Signature Saved", `Your signature has been saved successfully.`)
      return
    }

    // Show preview in modal
    if (signaturePreview) {
      signaturePreview.src = canvas.toDataURL()
    }

    if (signatureName) {
      signatureName.value = `Signature ${new Date().toLocaleString()}`
    }

    saveSignatureModal.show()
  }

  // Confirm save signature
  function confirmSaveSignature() {
    const name =
      signatureName && signatureName.value.trim()
        ? signatureName.value.trim()
        : `Signature ${new Date().toLocaleString()}`

    const dataUrl = canvas.toDataURL()

    // Save to localStorage
    const savedSignatures = JSON.parse(localStorage.getItem("savedSignatures") || "[]")
    savedSignatures.push({
      name: name,
      dataUrl: dataUrl,
      date: new Date().toISOString(),
    })

    localStorage.setItem("savedSignatures", JSON.stringify(savedSignatures))

    // Update signature list display
    loadSavedSignatures()

    if (saveSignatureModal) saveSignatureModal.hide()
    showNotification("Signature Saved", `Your signature "${name}" has been saved successfully.`)
  }

  // Load saved signatures
  function loadSavedSignatures() {
    const signatureList = document.getElementById("signatureList")
    if (!signatureList) return

    const savedSignatures = JSON.parse(localStorage.getItem("savedSignatures") || "[]")

    if (savedSignatures.length === 0) {
      signatureList.innerHTML = '<p class="no-signatures">No saved signatures</p>'
      return
    }

    signatureList.innerHTML = ""

    savedSignatures.forEach((signature, index) => {
      const signatureItem = document.createElement("div")
      signatureItem.className = "signature-item"
      signatureItem.innerHTML = `
        <img src="${signature.dataUrl}" alt="${signature.name}">
        <span class="delete-signature" data-index="${index}">
          <i class="bi bi-x"></i>
        </span>
      `
      signatureItem.title = signature.name

      // Load signature on click
      signatureItem.addEventListener("click", (e) => {
        if (!e.target.closest(".delete-signature")) {
          loadSignature(signature.dataUrl)
        }
      })

      signatureList.appendChild(signatureItem)
    })

    // Add delete event listeners
    document.querySelectorAll(".delete-signature").forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation()
        const index = Number.parseInt(this.getAttribute("data-index"), 10)
        deleteSignature(index)
      })
    })
  }

  // Load a signature onto the canvas
  function loadSignature(dataUrl) {
    const img = new Image()
    img.onload = () => {
      // Clear canvas first
      ctx.fillStyle = canvasColor ? canvasColor.value : "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calculate position to center the signature
      const scale = Math.min((canvas.width * 0.8) / img.width, (canvas.height * 0.8) / img.height)

      const x = (canvas.width - img.width * scale) / 2
      const y = (canvas.height - img.height * scale) / 2

      // Draw the signature
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale)

      // Save this state
      saveDrawingState()
      hasDrawnSomething = true
      if (canvasMessage) canvasMessage.style.opacity = "0"

      showNotification("Signature Loaded", "The signature has been loaded to the canvas.")
    }
    img.src = dataUrl
    img.crossOrigin = "anonymous"
  }

  // Delete a saved signature
  function deleteSignature(index) {
    if (!confirmationModal) {
      // Fallback if modal isn't available
      const savedSignatures = JSON.parse(localStorage.getItem("savedSignatures") || "[]")
      savedSignatures.splice(index, 1)
      localStorage.setItem("savedSignatures", JSON.stringify(savedSignatures))
      loadSavedSignatures()
      showNotification("Signature Deleted", "The signature has been deleted successfully.")
      return
    }

    confirmationModal.show()
    if (confirmationMessage) {
      confirmationMessage.textContent = "Are you sure you want to delete this signature?"
    }

    if (confirmActionButton) {
      confirmActionButton.onclick = () => {
        const savedSignatures = JSON.parse(localStorage.getItem("savedSignatures") || "[]")
        savedSignatures.splice(index, 1)
        localStorage.setItem("savedSignatures", JSON.stringify(savedSignatures))

        loadSavedSignatures()
        confirmationModal.hide()

        showNotification("Signature Deleted", "The signature has been deleted successfully.")
      }
    }
  }

  // Export functions
  function exportAsPNG() {
    const link = document.createElement("a")
    link.download = "signature.png"
    link.href = canvas.toDataURL("image/png")
    link.click()

    showNotification("Export Complete", "Your signature has been exported as PNG.")
  }

  function exportAsJPG() {
    const link = document.createElement("a")
    link.download = "signature.jpg"
    link.href = canvas.toDataURL("image/jpeg", 0.9)
    link.click()

    showNotification("Export Complete", "Your signature has been exported as JPG.")
  }

  function exportAsPDF() {
    // Check if jsPDF is available
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf
      const pdf = new jsPDF("l", "px", [canvas.width, canvas.height])

      const imgData = canvas.toDataURL("image/png", 1.0)
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height)
      pdf.save("signature.pdf")

      showNotification("Export Complete", "Your signature has been exported as PDF.")
    } else {
      showNotification("Error", "PDF export library not loaded. Please try again later.", true)
    }
  }

  // Fixed clipboard function to avoid the message channel error
  async function copyToClipboardFunc() {
    try {
      // Check if the document has focus
      if (!document.hasFocus()) {
        showNotification("Error", "Please focus on the page before copying to clipboard", true)
        return
      }

      const blob = await new Promise((resolve) => canvas.toBlob(resolve))

      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ])
          showNotification("Copied to Clipboard", "Your signature has been copied to the clipboard.")
        } catch (clipboardError) {
          // Fallback for clipboard write errors
          console.warn("Clipboard write failed, trying fallback:", clipboardError)
          throw clipboardError
        }
      } else {
        throw new Error("Clipboard API not supported")
      }
    } catch (err) {
      console.error("Clipboard error:", err)

      try {
        // Fallback method - create a temporary image and try to copy it
        const img = document.createElement("img")
        img.src = canvas.toDataURL()
        img.style.position = "absolute"
        img.style.left = "-9999px"

        document.body.appendChild(img)

        // Create a range and select the image
        const range = document.createRange()
        range.selectNode(img)

        window.getSelection().removeAllRanges()
        window.getSelection().addRange(range)

        // Try to copy
        const success = document.execCommand("copy")

        // Clean up
        window.getSelection().removeAllRanges()
        document.body.removeChild(img)

        if (success) {
          showNotification("Copied to Clipboard", "Your signature has been copied to the clipboard.")
        } else {
          showNotification("Error", "Clipboard access denied. Try using the export options instead.", true)
        }
      } catch (fallbackErr) {
        showNotification("Error", "Could not copy to clipboard. Please use the export options instead.", true)
      }
    }
  }

  // Show notification toast
  function showNotification(title, message, isError = false) {
    console.log(`${title}: ${message}`)

    if (!notificationToast) {
      // If toast isn't available, use alert for errors
      if (isError) {
        alert(`${title}: ${message}`)
      }
      return
    }

    if (toastTitle) toastTitle.textContent = title
    if (toastMessage) toastMessage.textContent = message

    const toastElement = document.getElementById("notificationToast")
    if (toastElement) {
      if (isError) {
        toastElement.classList.add("bg-danger", "text-white")
      } else {
        toastElement.classList.remove("bg-danger", "text-white")
      }
    }

    notificationToast.show()
  }

  // Set up event listeners if elements exist
  // Canvas drawing events
  if (canvas) {
    canvas.addEventListener("mousedown", startDrawing)
    canvas.addEventListener("mousemove", draw)
    canvas.addEventListener("mouseup", stopDrawing)
    canvas.addEventListener("mouseout", stopDrawing)

    // Touch support for mobile devices
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault()
      startDrawing(e)
    })

    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault()
      draw(e)
    })

    canvas.addEventListener("touchend", stopDrawing)
    canvas.addEventListener("touchcancel", stopDrawing)
  }

  // Tool settings
  if (colorPicker) {
    colorPicker.addEventListener("change", (e) => {
      ctx.strokeStyle = e.target.value
      ctx.fillStyle = e.target.value
    })
  }

  if (canvasColor) {
    canvasColor.addEventListener("change", (e) => {
      // Save current drawing
      const currentDrawing = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Fill with new background color
      ctx.fillStyle = e.target.value
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Restore drawing on top of new background
      ctx.putImageData(currentDrawing, 0, 0)

      // Save this state
      saveDrawingState()
    })
  }

  if (lineWidthInput && lineWidthValue) {
    lineWidthInput.addEventListener("input", (e) => {
      ctx.lineWidth = e.target.value
      lineWidthValue.textContent = `${e.target.value}px`
    })
  }

  if (showGridCheckbox) {
    showGridCheckbox.addEventListener("change", updateGrid)
  }

  // Tool selection
  if (penTool) penTool.addEventListener("click", () => setActiveTool("pen"))
  if (brushTool) brushTool.addEventListener("click", () => setActiveTool("brush"))
  if (eraserTool) eraserTool.addEventListener("click", () => setActiveTool("eraser"))

  // History controls
  if (undoButton) undoButton.addEventListener("click", undo)
  if (redoButton) redoButton.addEventListener("click", redo)

  // Action buttons
  if (clearButton) clearButton.addEventListener("click", clearCanvas)
  if (saveButton) saveButton.addEventListener("click", saveSignature)
  if (confirmSaveButton) confirmSaveButton.addEventListener("click", confirmSaveSignature)
  if (exportPNG) exportPNG.addEventListener("click", exportAsPNG)
  if (exportJPG) exportJPG.addEventListener("click", exportAsJPG)
  if (exportPDF) exportPDF.addEventListener("click", exportAsPDF)
  if (copyToClipboard) copyToClipboard.addEventListener("click", copyToClipboardFunc)

  // Load saved signatures on startup
  loadSavedSignatures()
})
